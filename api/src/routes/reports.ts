import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as XLSX from 'xlsx';
import { authenticate, requireRole } from '../middleware/auth';
import { getSupabase } from '../config/supabase';

function toXLSX(rows: Record<string,unknown>[], sheetName='Report'): Buffer {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, {type:'buffer',bookType:'xlsx'}) as Buffer;
}

function toCSV(rows: Record<string,unknown>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map(h=>JSON.stringify(r[h]??'')).join(','));
  }
  return lines.join('\n');
}

function sendReport(reply:FastifyReply, data:Record<string,unknown>[], format:string, filename:string) {
  if (format==='csv') {
    reply.header('Content-Type','text/csv');
    reply.header('Content-Disposition',`attachment; filename="${filename}.csv"`);
    return reply.send(toCSV(data));
  }
  const buf = toXLSX(data, filename);
  reply.header('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  reply.header('Content-Disposition',`attachment; filename="${filename}.xlsx"`);
  return reply.send(buf);
}

// Helper: given a list of rows with a customer_id field, fetch and attach customer + camp info
async function attachCustomerAndCamp(sb: ReturnType<typeof getSupabase>, rows: any[]) {
  const custIds = [...new Set(rows.map(r => r.customer_id).filter(Boolean))];
  if (custIds.length === 0) return;
  const { data: custs } = await sb.from('customers').select('id, full_name, service_number, rank, phone_number, camp_id').in('id', custIds);
  const campIds = [...new Set((custs || []).map(c => c.camp_id).filter(Boolean))];
  const campsRes = campIds.length > 0 ? await sb.from('camps').select('id, name').in('id', campIds) : { data: [] };
  const campMap = Object.fromEntries((campsRes.data || []).map(c => [c.id, c.name]));
  const custMap = Object.fromEntries((custs || []).map(c => [c.id, { ...c, camp: { name: campMap[c.camp_id] } }]));
  rows.forEach(r => { r.customer = custMap[r.customer_id] || null; });
}

export default async function reportRoutes(app: FastifyInstance) {
  const requireReportsAccess = requireRole('finance_officer', 'accountant', 'camp_officer', 'admin', 'super_admin');

  // Monthly deduction report
  app.get('/monthly-deductions', { preHandler:[authenticate,requireReportsAccess] }, async (req:FastifyRequest, reply) => {
    const q = req.query as {year?:string;month?:string;camp_id?:string;format?:string};
    const sb = getSupabase();
    let query = sb.from('installments')
      .select('due_year,due_month,status,expected_amount,deducted_amount,arrears_amount,not_deducted_reason,customer_id')
      .order('due_year').order('due_month');
    if (q.year)    query = query.eq('due_year',parseInt(q.year));
    if (q.month)   query = query.eq('due_month',parseInt(q.month));
    const {data} = await query.limit(5000);
    const rows = data || [];
    await attachCustomerAndCamp(sb, rows);
    // Filter by camp if specified
    const filtered = q.camp_id ? rows.filter((r: any) => r.customer?.camp_id === q.camp_id) : rows;
    const flat = filtered.map((r: any) => ({
      Year: r.due_year, Month: r.due_month,
      Camp: r.customer?.camp?.name ?? '',
      Name: r.customer?.full_name ?? '', ServiceNo: r.customer?.service_number ?? '',
      Rank: r.customer?.rank ?? '', Status: r.status,
      Expected: r.expected_amount, Deducted: r.deducted_amount,
      Arrears: r.arrears_amount, Reason: r.not_deducted_reason ?? '',
    }));
    return sendReport(reply, flat, q.format??'xlsx', `Deductions_${q.year??'All'}_${q.month??'All'}`);
  });

  // Arrears report
  app.get('/arrears', { preHandler:[authenticate,requireReportsAccess] }, async (req:FastifyRequest, reply) => {
    const q = req.query as {format?:string};
    const sb = getSupabase();
    const {data: rawRows} = await sb.from('installments')
      .select('arrears_amount,due_year,due_month,status,customer_id,application_id')
      .gt('arrears_amount',0).order('arrears_amount',{ascending:false}).limit(2000);
    const rows = rawRows || [];
    await attachCustomerAndCamp(sb, rows);
    const appIds = [...new Set(rows.map((r: any) => r.application_id).filter(Boolean))];
    const appsRes = appIds.length > 0 ? await sb.from('applications').select('id, ref_number').in('id', appIds) : { data: [] };
    const appMap = Object.fromEntries((appsRes.data || []).map(a => [a.id, a]));
    const flat = rows.map((r: any) => {
      const app = appMap[r.application_id];
      return {Ref:app?.ref_number,Name:r.customer?.full_name,ServiceNo:r.customer?.service_number,Camp:r.customer?.camp?.name,Phone:r.customer?.phone_number,Year:r.due_year,Month:r.due_month,Status:r.status,Arrears:r.arrears_amount};
    });
    return sendReport(reply, flat, q.format??'xlsx', 'Arrears_Report');
  });

  // Commissions report
  app.get('/commissions', { preHandler:[authenticate,requireReportsAccess] }, async (req:FastifyRequest, reply) => {
    const q = req.query as {status?:string;format?:string};
    const sb = getSupabase();
    let query = sb.from('commissions').select('*, sales_officer_id, customer_id, application_id').order('created_at',{ascending:false}).limit(2000);
    if (q.status) query = query.eq('status',q.status);
    const {data: rawRows} = await query;
    const rows = rawRows || [];
    
    const userIds = [...new Set(rows.map((r: any) => r.sales_officer_id).filter(Boolean))];
    const custIds = [...new Set(rows.map((r: any) => r.customer_id).filter(Boolean))];
    const appIds = [...new Set(rows.map((r: any) => r.application_id).filter(Boolean))];
    const [usersRes, custsRes, appsRes] = await Promise.all([
      userIds.length > 0 ? sb.from('users').select('id, phone_number').in('id', userIds) : Promise.resolve({ data: [] }),
      custIds.length > 0 ? sb.from('customers').select('id, full_name, service_number').in('id', custIds) : Promise.resolve({ data: [] }),
      appIds.length > 0 ? sb.from('applications').select('id, ref_number').in('id', appIds) : Promise.resolve({ data: [] }),
    ]);
    const userMap = Object.fromEntries((usersRes.data || []).map(u => [u.id, u]));
    const custMap = Object.fromEntries((custsRes.data || []).map(c => [c.id, c]));
    const appMap = Object.fromEntries((appsRes.data || []).map(a => [a.id, a]));

    const flat = rows.map((r: any) => ({
      Ref: appMap[r.application_id]?.ref_number,
      SalesOfficer: userMap[r.sales_officer_id]?.phone_number,
      Customer: custMap[r.customer_id]?.full_name,
      ServiceNo: custMap[r.customer_id]?.service_number,
      Amount: r.amount, Status: r.status, PaidAt: r.paid_at ?? '',
    }));
    return sendReport(reply, flat, q.format??'xlsx', 'Commissions_Report');
  });

  // Legacy import error report
  app.get('/legacy-errors/:batchId', { preHandler:[authenticate,requireReportsAccess] }, async (req:FastifyRequest, reply) => {
    const {batchId} = req.params as {batchId:string};
    const q = req.query as {format?:string};
    const {data} = await getSupabase().from('legacy_import_rows')
      .select('row_number,service_number,customer_name,status,validation_errors,monthly_amount')
      .eq('batch_id',batchId).in('status',['invalid','duplicate','manual_review']).order('row_number');
    const flat = (data??[]).map((r:Record<string,unknown>)=>({
      RowNo:r.row_number,ServiceNo:r.service_number??'',Name:r.customer_name??'',Monthly:r.monthly_amount??'',
      Status:r.status,Errors:Array.isArray(r.validation_errors)?(r.validation_errors as string[]).join('; '):'',
    }));
    return sendReport(reply, flat, q.format??'xlsx', `Import_Errors_${batchId.slice(0,8)}`);
  });

  // Risk report
  app.get('/risk', { preHandler:[authenticate,requireReportsAccess] }, async (req:FastifyRequest, reply) => {
    const q = req.query as {level?:string;format?:string};
    const sb = getSupabase();
    let query = sb.from('customers')
      .select('full_name,nic_number,service_number,branch,rank,risk_level,risk_score,retirement_date,phone_number,camp_id').is('deleted_at',null).order('risk_score',{ascending:false});
    if (q.level) query = query.eq('risk_level',q.level);
    const {data: rawRows} = await query.limit(2000);
    const rows = rawRows || [];
    const campIds = [...new Set(rows.map(c => c.camp_id).filter(Boolean))];
    const campsRes = campIds.length > 0 ? await sb.from('camps').select('id, name').in('id', campIds) : { data: [] };
    const campMap = Object.fromEntries((campsRes.data || []).map(c => [c.id, c.name]));
    const flat = rows.map((r: any) => ({ ...r, camp: campMap[r.camp_id] ?? '', camp_id: undefined }));
    return sendReport(reply, flat, q.format??'xlsx', 'Risk_Report');
  });

  // Retirement risk
  app.get('/retirement-risk', { preHandler:[authenticate,requireReportsAccess] }, async (req:FastifyRequest, reply) => {
    const q = req.query as {format?:string};
    const sb = getSupabase();
    const now = new Date();
    const in24mo = new Date(now.getFullYear(),now.getMonth()+24,now.getDate()).toISOString().split('T')[0];
    const {data: rawRows} = await sb.from('customers')
      .select('id,full_name,service_number,branch,rank,retirement_date,phone_number,camp_id')
      .lte('retirement_date',in24mo).gt('retirement_date',now.toISOString().split('T')[0]).is('deleted_at',null).order('retirement_date').limit(2000);
    const rows = rawRows || [];
    const campIds = [...new Set(rows.map(c => c.camp_id).filter(Boolean))];
    const campsRes = campIds.length > 0 ? await sb.from('camps').select('id, name').in('id', campIds) : { data: [] };
    const campMap = Object.fromEntries((campsRes.data || []).map(c => [c.id, c.name]));
    
    // Fetch active applications for these customers
    const custIds = rows.map(r => r.id);
    const appsRes = custIds.length > 0 ? await sb.from('applications').select('customer_id, id, ref_number, plan_end_date, status, monthly_amount').in('customer_id', custIds).eq('status','active') : { data: [] };
    const appsByCust: Record<string, any[]> = {};
    (appsRes.data || []).forEach(a => { appsByCust[a.customer_id] = appsByCust[a.customer_id] || []; appsByCust[a.customer_id].push(a); });

    const flat = rows.map(r => ({
      Name: r.full_name, ServiceNo: r.service_number, Branch: r.branch, Rank: r.rank,
      Camp: campMap[r.camp_id] ?? '',
      RetirementDate: r.retirement_date,
      ActivePlans: (appsByCust[r.id] || []).length,
    }));
    return sendReport(reply, flat, q.format??'xlsx', 'Retirement_Risk');
  });
}
