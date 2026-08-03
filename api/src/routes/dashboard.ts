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

    // 4. Monthly expected vs actual collection rate
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // Fetch installments for current month, or fallback to all active installments if none in current month
    let { data: insts } = await sb.from('installments')
      .select('status, expected_amount, deducted_amount')
      .eq('due_year', currentYear)
      .eq('due_month', currentMonth);

    if (!insts || insts.length === 0) {
      const { data: allInsts } = await sb.from('installments')
        .select('status, expected_amount, deducted_amount');
      insts = allInsts || [];
    }

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

    // 5. Net profit (Income - Approved Expenses)
    // Filter out categories that are income/revenue (e.g. Sales Revenue)
    const { data: expenses } = await sb.from('expenses')
      .select('amount, category:expense_categories(name, type)')
      .eq('status', 'approved')
      .is('deleted_at', null);

    let totalExpenses = 0;
    let otherIncome = 0;

    (expenses ?? []).forEach(e => {
      const catName = (e.category as any)?.name || '';
      const catType = (e.category as any)?.type || '';
      const isIncome = catType === 'income' || /revenue|income|sales/i.test(catName);

      if (isIncome) {
        otherIncome += Number(e.amount || 0);
      } else {
        totalExpenses += Number(e.amount || 0);
      }
    });

    const totalIncome = actualTotal + otherIncome;
    const netProfit = totalIncome - totalExpenses;

    // 6. Inventory Value (based on cost price of in stock phones)
    const { data: phones } = await sb.from('phones')
      .select('phone_model_id')
      .eq('status', 'in_stock');

    const inStockCount = (phones ?? []).length;
    let inventoryValue = 0;
    if (inStockCount > 0) {
      const modelIds = [...new Set((phones || []).map(p => p.phone_model_id).filter(Boolean))];
      const { data: models } = await sb.from('phone_models').select('id, purchase_cost').in('id', modelIds);
      const modelCostMap = Object.fromEntries((models || []).map(m => [m.id, Number(m.purchase_cost || 0)]));
      inventoryValue = (phones ?? []).reduce((s, p: any) => s + (modelCostMap[p.phone_model_id] || 0), 0);
    }

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
      actualTotal: totalIncome,
      netProfit,
      failureCount,
      inventoryValue,
      inStockCount,
      commPayable: commPayable ?? 0,
    });
  });

  app.get('/charts/collections', { preHandler: [authenticate] }, async (req: FastifyRequest, reply) => {
    const q = req.query as { year?: string };
    const targetYear = parseInt(q.year || new Date().getFullYear().toString());
    const sb = getSupabase();
    
    let { data: insts } = await sb.from('installments')
      .select('due_year, due_month, deducted_amount, expected_amount, due_date')
      .eq('due_year', targetYear);

    // Fallback: if no data for targeted year (e.g. 2026), fetch all installments
    if (!insts || insts.length === 0) {
      const { data: allData } = await sb.from('installments').select('due_year, due_month, deducted_amount, expected_amount, due_date');
      insts = allData || [];
    }

    // Fetch approved revenue/income entries
    const { data: expenses } = await sb.from('expenses')
      .select('amount, expense_date, category:expense_categories(name, type)')
      .eq('status', 'approved')
      .is('deleted_at', null);

    const monthlyMap: Record<number, number> = {};
    for (let m = 1; m <= 12; m++) {
      monthlyMap[m] = 0;
    }

    // Sum installments (deducted amount or expected amount if deducted is 0)
    (insts ?? []).forEach(i => {
      let m = Number(i.due_month);
      if (!m && i.due_date) {
        m = new Date(i.due_date).getMonth() + 1;
      }
      m = m || 1;
      if (m >= 1 && m <= 12) {
        const amt = Number(i.deducted_amount || 0) || Number(i.expected_amount || 0);
        monthlyMap[m] = (monthlyMap[m] ?? 0) + amt;
      }
    });

    // Sum income/revenue entries by month
    (expenses ?? []).forEach(e => {
      const catName = (e.category as any)?.name || '';
      const catType = (e.category as any)?.type || '';
      const isIncome = catType === 'income' || /revenue|income|sales/i.test(catName);

      if (isIncome && e.expense_date) {
        const m = new Date(e.expense_date).getMonth() + 1;
        if (m >= 1 && m <= 12) {
          monthlyMap[m] = (monthlyMap[m] ?? 0) + Number(e.amount || 0);
        }
      }
    });

    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const chartData = monthLabels.map((l, i) => ({
      month: l,
      amount: monthlyMap[i + 1] ?? 0,
    }));

    return reply.send({ data: chartData });
  });

  app.get('/charts/expenses', { preHandler: [authenticate] }, async (req: FastifyRequest, reply) => {
    const q = req.query as { year?: string };
    const targetYear = parseInt(q.year || new Date().getFullYear().toString());
    const sb = getSupabase();

    const { data: expenses } = await sb.from('expenses')
      .select('amount, expense_date, category:expense_categories(name, type)')
      .eq('status', 'approved')
      .is('deleted_at', null);

    const monthlyMap: Record<number, number> = {};
    for (let m = 1; m <= 12; m++) {
      monthlyMap[m] = 0;
    }

    (expenses ?? []).forEach(e => {
      const catName = (e.category as any)?.name || '';
      const catType = (e.category as any)?.type || '';
      const isIncome = catType === 'income' || /revenue|income|sales/i.test(catName);

      if (!isIncome && e.expense_date) {
        const m = new Date(e.expense_date).getMonth() + 1;
        if (m >= 1 && m <= 12) {
          monthlyMap[m] = (monthlyMap[m] ?? 0) + Number(e.amount || 0);
        }
      }
    });

    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const chartData = monthLabels.map((l, i) => ({
      month: l,
      amount: monthlyMap[i + 1] ?? 0,
    }));

    return reply.send({ data: chartData });
  });

  app.get('/expenses/breakdown', { preHandler: [authenticate] }, async (req: FastifyRequest, reply) => {
    const q = req.query as { year?: string, month?: string };
    const year = parseInt(q.year || new Date().getFullYear().toString());
    const month = parseInt(q.month || (new Date().getMonth() + 1).toString());

    const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = new Date(year, month, 0);
    const endStr = `${year}-${String(month).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;

    const sb = getSupabase();
    
    let { data: expenses, error } = await sb.from('expenses')
      .select('amount, category:expense_categories(name, type)')
      .gte('expense_date', startStr)
      .lte('expense_date', endStr)
      .eq('status', 'approved')
      .is('deleted_at', null);

    if (error) return reply.status(500).send({ error: error.message });

    // Fallback: if no expenses for target month, fetch all approved expenses
    if (!expenses || expenses.length === 0) {
      const { data: allExp } = await sb.from('expenses')
        .select('amount, category:expense_categories(name, type)')
        .eq('status', 'approved')
        .is('deleted_at', null);
      expenses = allExp || [];
    }

    const grouped: Record<string, number> = {};
    let total = 0;

    (expenses || []).forEach(e => {
      const catName = (e.category as any)?.name || 'Uncategorized';
      const catType = (e.category as any)?.type || '';
      const isIncome = catType === 'income' || /revenue|income|sales/i.test(catName);

      // Exclude income/revenue categories from expense breakdown!
      if (!isIncome) {
        const amount = Number(e.amount || 0);
        grouped[catName] = (grouped[catName] || 0) + amount;
        total += amount;
      }
    });

    const breakdown = Object.entries(grouped).map(([category, amount]) => ({
      category,
      total: amount,
      percentage: total > 0 ? Math.round((amount / total) * 100) : 0,
    }));

    return reply.send({ data: breakdown });
  });

  app.get('/financial-summary', { preHandler: [authenticate] }, async (req: FastifyRequest, reply) => {
    const q = req.query as { year?: string, month?: string };
    const year = parseInt(q.year || new Date().getFullYear().toString());
    const month = parseInt(q.month || (new Date().getMonth() + 1).toString());

    const sb = getSupabase();

    let { data: insts } = await sb.from('installments')
      .select('deducted_amount')
      .eq('due_year', year)
      .eq('due_month', month);

    if (!insts || insts.length === 0) {
      const { data: allInsts } = await sb.from('installments').select('deducted_amount');
      insts = allInsts || [];
    }

    let income = 0;
    (insts ?? []).forEach(i => {
      income += Number(i.deducted_amount || 0);
    });

    const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = new Date(year, month, 0);
    const endStr = `${year}-${String(month).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    
    let { data: expenses } = await sb.from('expenses')
      .select(`
        amount,
        category:expense_categories(name, type)
      `)
      .gte('expense_date', startStr)
      .lte('expense_date', endStr)
      .eq('status', 'approved')
      .is('deleted_at', null);

    if (!expenses || expenses.length === 0) {
      const { data: allExp } = await sb.from('expenses')
        .select('amount, category:expense_categories(name, type)')
        .eq('status', 'approved')
        .is('deleted_at', null);
      expenses = allExp || [];
    }

    let totalExpenses = 0;
    let otherIncome = 0;
    
    (expenses ?? []).forEach(e => {
      const catName = (e.category as any)?.name || '';
      const catType = (e.category as any)?.type || '';
      const isIncome = catType === 'income' || /revenue|income|sales/i.test(catName);

      if (isIncome) {
        otherIncome += Number(e.amount || 0);
      } else {
        totalExpenses += Number(e.amount || 0);
      }
    });

    const netProfit = (income + otherIncome) - totalExpenses;

    return reply.send({
      income: income + otherIncome,
      expenses: totalExpenses,
      netProfit,
    });
  });


  app.get('/ai-alerts', { preHandler: [authenticate] }, async (_req, reply) => {
    const sb = getSupabase();
    // Return typical critical alerts dynamically compiled from data anomalies
    const { data: highRisk } = await sb.from('customers')
      .select('full_name, risk_score, camp_id')
      .gt('risk_score', 60)
      .limit(3);

    const campIds = [...new Set((highRisk || []).map(c => c.camp_id).filter(Boolean))];
    const campsRes = campIds.length > 0 ? await sb.from('camps').select('id, name').in('id', campIds) : { data: [] };
    const campMap = Object.fromEntries((campsRes.data || []).map(c => [c.id, c.name]));

    const alerts = (highRisk ?? []).map(c => ({
      sev: 'red',
      icon: 'ti-alert-triangle',
      title: `High Risk — ${campMap[c.camp_id] ?? 'Camp'}`,
      msg: `${c.full_name} has a risk score of ${c.risk_score}. Extra verification recommended.`,
      time: 'Just now',
      action: 'Review',
    }));

    return reply.send({ data: alerts });
  });

  app.post('/weekly-summary', { preHandler: [authenticate] }, async (_req, reply) => {
    const sb = getSupabase();
    
    const { count: totalCustomers } = await sb.from('customers').select('id', { count: 'exact', head: true }).is('deleted_at', null);
    const { count: pendingApps } = await sb.from('applications').select('id', { count: 'exact', head: true }).in('status', ['submitted', 'docs_review', 'camp_review']);
    
    // Get June/Current month installments data
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

    const anthropicApiKey = process.env.CLAUDE_API_KEY;
    if (!anthropicApiKey) {
      return reply.send({ summary: "AI Summary is unavailable (CLAUDE_API_KEY not configured)." });
    }

    try {
      const { Anthropic } = require('@anthropic-ai/sdk');
      const anthropic = new Anthropic({ apiKey: anthropicApiKey });

      const prompt = `You are a financial AI assistant for AIRVOICE Defence Finance Management. Please provide a concise, professional 3-4 sentence weekly executive summary of the following real data:\nTotal Customers: ${totalCustomers ?? 0}\nPending Applications: ${pendingApps ?? 0}\nExpected Total Collection: LKR ${expectedTotal}\nActual Total Collection: LKR ${actualTotal}\nFailed Installments: ${failureCount}\nHighlight any risks and suggest a quick action. Avoid markdown.`;

      const response = await anthropic.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 150,
        messages: [{ role: "user", content: prompt }]
      });

      return reply.send({ summary: (response.content[0] as any).text });
    } catch (e: any) {
      console.error('Claude AI Error:', e);
      return reply.send({ summary: "Failed to generate AI summary at this time. Please try again later." });
    }
  });
}
