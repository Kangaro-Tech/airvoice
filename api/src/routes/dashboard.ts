import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate } from '../middleware/auth';
import { getSupabase } from '../config/supabase';

export default async function dashboardRoutes(app: FastifyInstance) {
  app.get('/kpis', { preHandler: [authenticate] }, async (_req, reply) => {
    const sb = getSupabase();

    // 1. Total Customers count
    const { count: totalCustomers } = await sb.from('customers')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null);

    // 2. Active phone plans (applications where status is 'active')
    const { count: activePlans } = await sb.from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');

    // 3. Pending applications (review stages)
    const { count: pendingApps } = await sb.from('applications')
      .select('id', { count: 'exact', head: true })
      .in('status', ['submitted', 'docs_review', 'camp_review', 'finance_review']);

    // 4. Jun expected vs actual collection rate
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const { data: insts } = await sb.from('installments')
      .select('status, expected_amount, deducted_amount')
      .eq('due_year', currentYear)
      .eq('due_month', currentMonth);

    let expectedTotal = 0;
    let actualTotal = 0;
    let failureCount = 0;

    (insts ?? []).forEach(i => {
      expectedTotal += Number(i.expected_amount || 0);
      actualTotal += Number(i.deducted_amount || 0);
      if (i.status === 'missed' || i.status === 'not_deducted') {
        failureCount++;
      }
    });

    const collectionRatePct = expectedTotal > 0 ? ((actualTotal / expectedTotal) * 100).toFixed(1) : '100.0';

    // 5. Net profit (Collections - Approved Expenses)
    const { data: expenses } = await sb.from('expenses')
      .select('amount')
      .eq('status', 'approved');

    const totalExpenses = (expenses ?? []).reduce((s, e) => s + Number(e.amount), 0);
    const netProfit = actualTotal - totalExpenses;

    // 6. Inventory Value (based on cost price of in stock phones)
    const { data: phones } = await sb.from('phones')
      .select('phone_models(purchase_cost)')
      .eq('status', 'in_stock');

    const inventoryValue = (phones ?? []).reduce((s, p: any) => s + Number(p.phone_models?.purchase_cost || 0), 0);
    const inStockCount = (phones ?? []).length;

    // 7. Commissions Payable
    const { count: commPayable } = await sb.from('commissions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'payable');

    return reply.send({
      totalCustomers: totalCustomers ?? 0,
      activePlans: activePlans ?? 0,
      pendingApps: pendingApps ?? 0,
      collectionRatePct,
      expectedTotal,
      actualTotal,
      netProfit,
      failureCount,
      inventoryValue,
      inStockCount,
      commPayable: commPayable ?? 0,
    });
  });

  app.get('/charts/collections', { preHandler: [authenticate] }, async (_req, reply) => {
    const sb = getSupabase();
    // Retrieve monthly collections summary for the current year
    const { data } = await sb.from('installments')
      .select('due_year, due_month, deducted_amount')
      .eq('due_year', new Date().getFullYear());

    const monthlyMap: Record<number, number> = {};
    for (let m = 1; m <= 12; m++) {
      monthlyMap[m] = 0;
    }

    (data ?? []).forEach(i => {
      monthlyMap[i.due_month] = (monthlyMap[i.due_month] ?? 0) + Number(i.deducted_amount || 0);
    });

    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const chartData = monthLabels.map((l, i) => ({
      month: l,
      amount: monthlyMap[i + 1] ?? 0,
    }));

    return reply.send({ data: chartData });
  });

  app.get('/ai-alerts', { preHandler: [authenticate] }, async (_req, reply) => {
    const sb = getSupabase();
    // Return typical critical alerts dynamically compiled from data anomalies
    const { data: highRisk } = await sb.from('customers')
      .select('full_name, risk_score, camp:camps(name)')
      .gt('risk_score', 60)
      .limit(3);

    const alerts = (highRisk ?? []).map(c => ({
      sev: 'red',
      icon: 'ti-alert-triangle',
      title: `High Risk — ${(c.camp as any)?.name ?? 'Camp'}`,
      msg: `${c.full_name} has a risk score of ${c.risk_score}. Extra verification recommended.`,
      time: 'Just now',
      action: 'Review',
    }));

    return reply.send({ data: alerts });
  });

  app.post('/weekly-summary', { preHandler: [authenticate] }, async (_req, reply) => {
    // Standard mock analysis summary representing a breakdown of Sri Lankan military segments
    return reply.send({
      summary: `AIRVOICE Command Intelligence weekly summary:
Collections are solid at 93.5% of expected LKR 8.4M. Diyatalawa Camp has experienced a minor 2.4% dip in recovery rates due to recent transfers. 
There are 4 high-risk customer profiles requiring immediate guarantor notice review. 
Commissions payable are fully aligned with the June salary runs. Suggested: Initiate bulk WhatsApp reminders for overdue accounts in Galle Naval base.`
    });
  });
}
