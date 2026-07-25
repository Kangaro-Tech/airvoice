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

export default async function reportRoutes(app: FastifyInstance) {
  const requireReportsAccess = requireRole('finance_officer', 'accountant', 'camp_officer', 'admin', 'super_admin');

  // Monthly deduction report
  app.get('/monthly-deductions', { preHandler:[authenticate,requireReportsAccess] }, async (req:FastifyRequest, reply) => {
    const q = req.query as {year?:string;month?:string;camp_id?:string;format?:string};
    const sb = getSupabase();
    let query = sb.from('installments')
      .select('due_year,due_month,status,expected_amount,deducted_amount,arrears_amount,not_deducted_reason,customer:customers(full_name,service_number,rank,camp:camps(name))')
      .order('due_year').order('due_month');
    if (q.year)    query = query.eq('due_year',parseInt(q.year));
    if (q.month)   query = query.eq('due_month',parseInt(q.month));
    const {data} = await query.limit(5000);
    const flat = (data??[]).map((r:Record<string,unknown>) => {
      const cust = r.customer as Record<string,unknown>|null;
      const camp = cust?.camp as Record<string,unknown>|null;
      return {Year:r.due_year,Month:r.due_month,Camp:camp?.name??'',Name:cust?.full_name??'',ServiceNo:cust?.service_number??'',Rank:cust?.rank??'',Status:r.status,Expected:r.expected_amount,Deducted:r.deducted_amount,Arrears:r.arrears_amount,Reason:r.not_deducted_reason??''};
    });
    return sendReport(reply, flat, q.format??'xlsx', `Deductions_${q.year??'All'}_${q.month??'All'}`);
  });

  // Arrears report
  app.get('/arrears', { preHandler:[authenticate,requireReportsAccess] }, async (req:FastifyRequest, reply) => {
    const q = req.query as {format?:string};
    const {data} = await getSupabase().from('installments')
      .select('arrears_amount,due_year,due_month,status,customer:customers(full_name,service_number,phone_number,camp:camps(name)),application:applications(ref_number)')
      .gt('arrears_amount',0).order('arrears_amount',{ascending:false}).limit(2000);
    const flat = (data??[]).map((r:Record<string,unknown>)=>{
      const c=r.customer as Record<string,unknown>|null, a=r.application as Record<string,unknown>|null, cp=(c?.camp as Record<string,unknown>|null);
      return {Ref:a?.ref_number,Name:c?.full_name,ServiceNo:c?.service_number,Camp:cp?.name,Phone:c?.phone_number,Year:r.due_year,Month:r.due_month,Status:r.status,Arrears:r.arrears_amount};
    });
    return sendReport(reply, flat, q.format??'xlsx', 'Arrears_Report');
  });

  // Commissions report
  app.get('/commissions', { preHandler:[authenticate,requireReportsAccess] }, async (req:FastifyRequest, reply) => {
    const q = req.query as {status?:string;format?:string};
    let query = getSupabase().from('commissions')
      .select('*,officer:users!sales_officer_id(phone_number),customer:customers(full_name,service_number),application:applications(ref_number)').order('created_at',{ascending:false}).limit(2000);
    if (q.status) query = query.eq('status',q.status);
    const {data} = await query;
    const flat = (data??[]).map((r:Record<string,unknown>)=>{
      const o=r.officer as Record<string,unknown>|null, c=r.customer as Record<string,unknown>|null, a=r.application as Record<string,unknown>|null;
      return {Ref:a?.ref_number,SalesOfficer:o?.phone_number,Customer:c?.full_name,ServiceNo:c?.service_number,Amount:r.amount,Status:r.status,PaidAt:r.paid_at??''};
    });
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
    let query = getSupabase().from('customers')
      .select('full_name,nic_number,service_number,branch,rank,risk_level,risk_score,retirement_date,phone_number,camp:camps(name)').is('deleted_at',null).order('risk_score',{ascending:false});
    if (q.level) query = query.eq('risk_level',q.level);
    const {data} = await query.limit(2000);
    const flat = (data??[]).map((r:Record<string,unknown>)=>{const c=r.camp as Record<string,unknown>|null;return {...r,camp:c?.name};});
    return sendReport(reply, flat, q.format??'xlsx', 'Risk_Report');
  });

  // Retirement risk
  app.get('/retirement-risk', { preHandler:[authenticate,requireReportsAccess] }, async (req:FastifyRequest, reply) => {
    const q = req.query as {format?:string};
    const now = new Date();
    const in24mo = new Date(now.getFullYear(),now.getMonth()+24,now.getDate()).toISOString().split('T')[0];
    const {data} = await getSupabase().from('customers')
      .select('full_name,service_number,branch,rank,retirement_date,phone_number,camp:camps(name),applications(id,ref_number,plan_end_date,status,monthly_amount)')
      .lte('retirement_date',in24mo).gt('retirement_date',now.toISOString().split('T')[0]).is('deleted_at',null).eq('applications.status','active').order('retirement_date');
    const flat = (data??[]).map((r:Record<string,unknown>)=>{
      const c=r.camp as Record<string,unknown>|null, apps=r.applications as Record<string,unknown>[]|null;
      return {Name:r.full_name,ServiceNo:r.service_number,Branch:r.branch,Rank:r.rank,Camp:c?.name,RetirementDate:r.retirement_date,ActivePlans:(apps??[]).length};
    });
    return sendReport(reply, flat, q.format??'xlsx', 'Retirement_Risk');
  });
}
