import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireFinance } from '../middleware/auth';
import { getSupabase } from '../config/supabase';

export default async function financeRoutes(app: FastifyInstance) {

  // ── GET /finance/summary ── high level KPIs and tab details
  app.get('/summary', { preHandler: [authenticate, requireFinance] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const q = req.query as { year?: string };
    const year = parseInt(q.year ?? String(new Date().getFullYear()));
    const sb = getSupabase();

    // 1. Fetch Installments
    const { data: insts } = await sb.from('installments')
      .select('expected_amount,deducted_amount,arrears_amount,status,due_year,due_month,due_date')
      .eq('due_year', year);

    const instList = insts ?? [];
    
    // 2. Fetch Active Plans Count
    const { count: activePlansCount } = await sb.from('applications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    // 3. Fetch Expenses
    const { data: exps } = await sb.from('expenses')
      .select('amount,expense_date,status,category:expense_categories(name)')
      .eq('status', 'approved');
    const approvedExpenses = exps ?? [];

    // 4. Fetch Payroll runs
    const { data: payrolls } = await sb.from('payroll_runs')
      .select('total_net,run_year,run_month')
      .in('status', ['approved', 'paid']);
    const approvedPayrolls = payrolls ?? [];

    // 5. Fetch Commissions (Paid)
    const { data: comms } = await sb.from('commissions')
      .select('amount,paid_at')
      .eq('status', 'paid');
    const paidCommissions = comms ?? [];

    // Calculations
    const expected = instList.reduce((s, i) => s + Number(i.expected_amount ?? 0), 0);
    const collected = instList.filter(i => i.status === 'deducted' || i.status === 'partial').reduce((s, i) => s + Number(i.deducted_amount ?? 0), 0);
    
    const arrearsCount = instList.filter(i => (i.status === 'not_deducted' || i.status === 'arrears' || i.status === 'partial') && new Date(i.due_date) <= new Date()).length;
    const arrearsAmount = instList.reduce((s, i) => s + Number(i.arrears_amount ?? 0), 0);

    const expensesTotal = approvedExpenses.filter(e => new Date(e.expense_date).getFullYear() === year).reduce((s, e) => s + Number(e.amount ?? 0), 0);
    const payrollTotal = approvedPayrolls.filter(p => Number(p.run_year) === year).reduce((s, p) => s + Number(p.total_net ?? 0), 0);

    const totalExpenses = expensesTotal + payrollTotal;
    const netProfit = collected - totalExpenses;
    const confirmedDeductionsCount = instList.filter(i => i.status === 'deducted').length;

    // Monthly collections and expenses
    const monthlySeries = Array.from({ length: 12 }, (_, i) => {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return {
        label: `${monthNames[i]} ${String(year).slice(-2)}`,
        collections: 0,
        expenses: 0,
      };
    });

    instList.forEach(it => {
      const m = Number(it.due_month) || 1;
      if (m >= 1 && m <= 12) {
        monthlySeries[m - 1].collections += (it.status === 'deducted' || it.status === 'partial') ? Number(it.deducted_amount ?? 0) : 0;
      }
    });

    approvedExpenses.forEach(e => {
      const d = new Date(e.expense_date);
      if (d.getFullYear() === year) {
        const m = d.getMonth();
        if (m >= 0 && m < 12) {
          monthlySeries[m].expenses += Number(e.amount ?? 0);
        }
      }
    });

    approvedPayrolls.forEach(p => {
      if (Number(p.run_year) === year) {
        const m = Number(p.run_month) - 1;
        if (m >= 0 && m < 12) {
          monthlySeries[m].expenses += Number(p.total_net ?? 0);
        }
      }
    });

    // P&L Statement breakdown (first 6 months of the year for simplicity in UI)
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = new Date().getMonth();
    // Start from 5 months ago to current month
    let startMonth = currentMonth - 5;
    if (startMonth < 0) startMonth = 0;
    
    const plMonths = Array.from({ length: 6 }, (_, i) => ({ label: monthNames[startMonth + i] }));

    // Helper to get 6-month array
    const get6Mo = () => [0, 0, 0, 0, 0, 0];
    const collectionsArr = get6Mo();
    const payrollArr = get6Mo();
    const commArr = get6Mo();
    const fuelArr = get6Mo();
    const officeArr = get6Mo();
    const donationCompanyArr = get6Mo();
    const otherExpArr = get6Mo();

    // Populate collections
    instList.forEach(it => {
      const m = Number(it.due_month) - 1;
      if (m >= startMonth && m < startMonth + 6) {
        collectionsArr[m - startMonth] += (it.status === 'deducted' || it.status === 'partial') ? Number(it.deducted_amount ?? 0) : 0;
      }
    });

    // Populate payroll
    approvedPayrolls.forEach(p => {
      if (Number(p.run_year) === year) {
        const m = Number(p.run_month) - 1;
        if (m >= startMonth && m < startMonth + 6) {
          payrollArr[m - startMonth] += Number(p.total_net ?? 0);
        }
      }
    });

    // Populate commissions
    paidCommissions.forEach(c => {
      const d = new Date(c.paid_at);
      if (d.getFullYear() === year) {
        const m = d.getMonth();
        if (m >= startMonth && m < startMonth + 6) {
          commArr[m - startMonth] += Number(c.amount ?? 0);
        }
      }
    });

    // Populate expenses
    approvedExpenses.forEach(e => {
      const d = new Date(e.expense_date);
      if (d.getFullYear() === year) {
        const m = d.getMonth();
        if (m >= startMonth && m < startMonth + 6) {
          const cat = (e.category?.name || '').toLowerCase();
          const amt = Number(e.amount ?? 0);
          if (cat.includes('fuel') || cat.includes('field')) {
            fuelArr[m - startMonth] += amt;
          } else if (cat.includes('office') || cat.includes('admin')) {
            officeArr[m - startMonth] += amt;
          } else if (cat.includes('donation') || cat.includes('company payment')) {
            donationCompanyArr[m - startMonth] += amt;
          } else {
            otherExpArr[m - startMonth] += amt;
          }
        }
      }
    });

    const incomeArr = collectionsArr;
    const totalExpArr = payrollArr.map((p, i) => p + commArr[i] + fuelArr[i] + officeArr[i] + donationCompanyArr[i] + otherExpArr[i]);
    const netProfitArr = incomeArr.map((inc, i) => inc - totalExpArr[i]);

    const plRows = [
      { label: 'Installment Collections', values: collectionsArr },
      { label: 'Total Income', values: incomeArr, bold: true, color: 'text-green-700' },
      { label: 'Staff Salaries', values: payrollArr },
      { label: 'Sales Commissions', values: commArr },
      { label: 'Fuel & Field Expenses', values: fuelArr },
      { label: 'Office & Admin', values: officeArr },
      { label: 'Donations & Company Payments', values: donationCompanyArr },
      { label: 'Other Expenses', values: otherExpArr },
      { label: 'Total Expenses', values: totalExpArr, bold: true, color: 'text-red-600' },
      { label: 'NET PROFIT', values: netProfitArr, bold: true, color: 'text-green-700', isTotal: true },
    ].map(row => ({
      ...row,
      total: row.values.reduce((s, v) => s + v, 0)
    }));

    // Arrears aging buckets
    const now = new Date();
    let d0_30 = 0, c0_30 = 0;
    let d31_60 = 0, c31_60 = 0;
    let d61_90 = 0, c61_90 = 0;
    let d90p = 0, c90p = 0;

    instList.forEach(i => {
      if ((i.status === 'not_deducted' || i.status === 'arrears' || i.status === 'partial') && i.arrears_amount > 0) {
        const due = new Date(i.due_date);
        if (due <= now) {
          const diffDays = Math.floor((now.getTime() - due.getTime()) / (1000 * 3600 * 24));
          const amt = Number(i.arrears_amount);
          if (diffDays <= 30) { d0_30 += amt; c0_30++; }
          else if (diffDays <= 60) { d31_60 += amt; c31_60++; }
          else if (diffDays <= 90) { d61_90 += amt; c61_90++; }
          else { d90p += amt; c90p++; }
        }
      }
    });

    const arrearsAging = [
      { range: '0-30 days', count: c0_30, amount: d0_30, color: 'var(--amber)' },
      { range: '31-60 days', count: c31_60, amount: d31_60, color: 'var(--red)' },
      { range: '61-90 days', count: c61_90, amount: d61_90, color: 'var(--red)' },
      { range: '90+ days', count: c90p, amount: d90p, color: '#8b1a10' },
    ];

    // Forecasts - Simple projection based on active plans
    // Calculate expected collections for the next 3 months
    const forecasts = [];
    const { data: activeApps } = await sb.from('applications').select('monthly_amount, plan_end_date').eq('status', 'active');
    
    for (let i = 1; i <= 3; i++) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const targetStr = targetDate.toISOString().split('T')[0];
      const targetMonthStr = `${monthNames[targetDate.getMonth()]} ${targetDate.getFullYear()}`;
      
      let expectedSum = 0;
      (activeApps ?? []).forEach(a => {
        if (!a.plan_end_date || a.plan_end_date >= targetStr) {
          expectedSum += Number(a.monthly_amount ?? 0);
        }
      });
      
      const confidence = 95 - (i * 3); // decreases slightly each month
      forecasts.push({
        month: targetMonthStr,
        expected: expectedSum,
        confidence: confidence,
        notes: `Projected based on ${activeApps?.length || 0} active plans continuing into ${targetMonthStr}.`
      });
    }

    return reply.send({
      expected_collections: expected || 0,
      collected: collected || 0,
      arrears_count: arrearsCount || 0,
      arrears_amount: arrearsAmount || 0,
      total_expenses: totalExpenses || 0,
      payroll_total: payrollTotal || 0,
      net_profit: netProfit || 0,
      active_plans_count: activePlansCount || 0,
      confirmed_deductions_count: confirmedDeductionsCount || 0,
      monthly_series: monthlySeries,
      pl_months: plMonths,
      pl_rows: plRows,
      arrears_aging: arrearsAging,
      forecasts: forecasts
    });
  });

  // ── GET /finance/camp-breakdown ── per-camp KPIs for a year
  app.get('/camp-breakdown', { preHandler: [authenticate, requireFinance] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const q = req.query as { year?: string };
    const year = parseInt(q.year ?? String(new Date().getFullYear()));
    const sb = getSupabase();

    // fetch camps
    const { data: camps } = await sb.from('camps').select('id,name,branch');

    // fetch installments joined to customer camp
    const { data: insts } = await sb.from('installments')
      .select('expected_amount,deducted_amount,status,due_year,due_month,application:applications(customer:customers(id,full_name,camp_id)))')
      .eq('due_year', year);

    const campMap: Record<string, any> = {};
    (camps ?? []).forEach((c: any) => campMap[c.id] = { id: c.id, name: c.name, tag: c.branch, collections: 0, expected: 0, loss: 0, customers: new Set<string>() });

    (insts ?? []).forEach((it: any) => {
      const cust = it.application?.customer;
      if (!cust || !cust.camp_id) return;
      const camp = campMap[cust.camp_id];
      if (!camp) return;
      camp.expected += Number(it.expected_amount ?? 0);
      if (it.status === 'deducted' || it.status === 'partial') {
        camp.collections += Number(it.deducted_amount ?? 0);
      } else if (it.status === 'not_deducted' || it.status === 'arrears') {
        camp.loss += Number(it.expected_amount ?? 0);
      }
      if (cust.id) camp.customers.add(cust.id);
    });

    const result = Object.values(campMap).map((c: any) => ({
      id: c.id,
      name: c.name,
      tag: c.tag === 'army' ? 'Army' : c.tag === 'navy' ? 'Navy' : c.tag === 'air_force' ? 'Air Force' : c.tag,
      collections: c.collections || 0,
      expected: c.expected || 0,
      loss: c.loss || 0,
      deduction_rate: c.expected > 0 ? Math.round((c.collections / c.expected) * 1000) / 10 : 0,
      customers_count: c.customers.size || 0,
    }));

    return reply.send({ data: result });
  });

  // ── POST /finance/pay-commissions ── Mark commissions as paid
  app.post('/pay-commissions', { preHandler: [authenticate, requireFinance] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const sb = getSupabase();
    const { officerId } = req.body as { officerId: string };

    const { data, error } = await sb.from('commissions')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('sales_officer_id', officerId)
      .eq('status', 'payable')
      .select();

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ success: true, data });
  });

}
