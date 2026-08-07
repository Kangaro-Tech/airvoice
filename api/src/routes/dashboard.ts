import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate } from '../middleware/auth';
import { getSupabase } from '../config/supabase';
import { generateAiSummary } from '../services/gemini';

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


  /**
   * GET /dashboard/ai-alerts
   * Returns AI-flagged customers who have 2 or more active phone applications.
   * These customers represent a higher credit/risk concentration.
   */
  app.get('/ai-alerts', { preHandler: [authenticate] }, async (_req, reply) => {
    const sb = getSupabase();

    // ── 1. Get phone counts per customer from `phones` table ──
    // This is a small dataset (only assigned phones, not all 24k customers)
    const { data: allPhones } = await sb.from('phones')
      .select('customer_id')
      .not('customer_id', 'is', null)
      .is('deleted_at', null);

    const phoneCounts: Record<string, number> = {};
    (allPhones ?? []).forEach((p: any) => {
      if (p.customer_id) phoneCounts[p.customer_id] = (phoneCounts[p.customer_id] || 0) + 1;
    });

    // ── 2. Get arrears from installments (only fetch flagged ones) ──
    const { data: arrearsRows } = await sb.from('installments')
      .select('customer_id, arrears_amount')
      .or('arrears_amount.gt.0,status.eq.not_deducted')
      .limit(5000);

    const arrearsMap: Record<string, number> = {};
    (arrearsRows ?? []).forEach((inst: any) => {
      if (inst.customer_id) {
        arrearsMap[inst.customer_id] = (arrearsMap[inst.customer_id] || 0) + Number(inst.arrears_amount || 0);
      }
    });

    // ── 3. Find flagged customer IDs ──
    const flaggedIds = new Set<string>();
    Object.entries(phoneCounts).forEach(([cId, count]) => { if (count >= 2) flaggedIds.add(cId); });
    Object.keys(arrearsMap).forEach(cId => flaggedIds.add(cId));

    if (flaggedIds.size === 0) return reply.send({ data: [] });

    // ── 4. Fetch customer details ONLY for flagged IDs (fast - small set) ──
    const flaggedIdsArray = Array.from(flaggedIds);
    const customersData: any[] = [];
    for (let i = 0; i < flaggedIdsArray.length; i += 400) {
      const chunk = flaggedIdsArray.slice(i, i + 400);
      const { data } = await sb.from('customers')
        .select('id, full_name, rank, branch, camp_id')
        .in('id', chunk)
        .is('deleted_at', null);
      if (data) customersData.push(...data);
    }

    // ── 5. Build and sort alerts ──
    const combinedData = customersData.map(c => ({
      customerId: c.id,
      name: c.full_name || 'Unknown',
      rank: c.rank || '',
      branch: c.branch || '',
      campId: c.camp_id || '',
      count: phoneCounts[c.id] || 0,
      hasArrears: !!arrearsMap[c.id],
      arrearsAmount: arrearsMap[c.id] || 0,
    }));

    combinedData.sort((a, b) => {
      if (a.hasArrears !== b.hasArrears) return a.hasArrears ? -1 : 1;
      return b.count - a.count;
    });
    const topFlagged = combinedData.slice(0, 15);

    const campIds = [...new Set(topFlagged.map(c => c.campId).filter(Boolean))];
    const campsRes = campIds.length > 0 ? await sb.from('camps').select('id, name').in('id', campIds) : { data: [] };
    const campMap = Object.fromEntries((campsRes.data || []).map((c: any) => [c.id, c.name]));

    const alerts = topFlagged.map(info => {
      let msg = '', title = '', sev = 'red';
      if (info.hasArrears && info.count >= 2) {
        title = `Critical Risk — ${info.rank} ${info.name}`;
        msg = `${info.name} has ${info.count} phones AND arrears of LKR ${info.arrearsAmount.toLocaleString()}. Action required at ${campMap[info.campId] ?? info.branch ?? 'Unknown unit'}.`;
        sev = 'critical';
      } else if (info.hasArrears) {
        title = `Arrears Alert — ${info.rank} ${info.name}`;
        msg = `${info.name} has arrears of LKR ${info.arrearsAmount.toLocaleString()}. Contact at ${campMap[info.campId] ?? info.branch ?? 'Unknown unit'}.`;
        sev = 'critical';
      } else {
        title = `Multi-Phone Risk — ${info.rank} ${info.name}`;
        msg = `${info.name} has ${info.count} active phones (${campMap[info.campId] ?? info.branch ?? 'Unknown unit'}). Elevated credit concentration risk.`;
        sev = info.count >= 3 ? 'critical' : 'red';
      }
      return { sev, icon: 'ti-alert-triangle', title, msg, time: 'Now', action: 'Review', customerId: info.customerId, phoneCount: info.count };
    });

    return reply.send({ data: alerts });
  });

  /**
   * GET /dashboard/customer-phone-counts
   * Returns customers with real risk data: phone counts, arrears, retirement risk.
   * Used by AI Risk Engine and Dashboard risk widget.
   */
  app.get('/customer-phone-counts', { preHandler: [authenticate] }, async (req, reply) => {
    const sb = getSupabase();
    const q = req.query as { page?: string; limit?: string; search?: string };
    const page  = Math.max(1, parseInt(q.page  || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(q.limit || '20')));
    const search = (q.search || '').trim().toLowerCase();

    // ── FAST: Get phone counts from `phones` table (small dataset) ──
    const { data: allPhones } = await sb.from('phones')
      .select('customer_id')
      .not('customer_id', 'is', null)
      .is('deleted_at', null);

    const phoneCounts: Record<string, number> = {};
    (allPhones ?? []).forEach((p: any) => {
      if (p.customer_id) phoneCounts[p.customer_id] = (phoneCounts[p.customer_id] || 0) + 1;
    });

    // ── Get arrears (only flagged installments) ──
    const { data: arrearsRows } = await sb.from('installments')
      .select('customer_id, arrears_amount')
      .or('arrears_amount.gt.0,status.eq.not_deducted')
      .limit(5000);

    const arrearsMap: Record<string, number> = {};
    (arrearsRows ?? []).forEach((inst: any) => {
      if (inst.customer_id) {
        arrearsMap[inst.customer_id] = (arrearsMap[inst.customer_id] || 0) + Number(inst.arrears_amount || 0);
      }
    });

    // ── Collect ALL relevant customer IDs (phones OR arrears) ──
    const relevantIds = new Set<string>();
    Object.keys(phoneCounts).forEach(id => relevantIds.add(id));
    Object.keys(arrearsMap).forEach(id => relevantIds.add(id));

    // ── Fetch customer details ONLY for relevant IDs (fast!) ──
    const relevantIdsArray = Array.from(relevantIds);
    const allCustomers: any[] = [];
    for (let i = 0; i < relevantIdsArray.length; i += 400) {
      const chunk = relevantIdsArray.slice(i, i + 400);
      const { data } = await sb.from('customers')
        .select('id, full_name, rank, branch, camp_id, service_number, phone_number, retirement_date, risk_score, risk_level')
        .in('id', chunk)
        .is('deleted_at', null);
      if (data) allCustomers.push(...data);
    }

    // ── Build result with risk scores ──
    let allResult = allCustomers.map((c: any) => {
      const phoneCount = phoneCounts[c.id] || 0;
      const hasArrears = !!arrearsMap[c.id];
      const arrearsAmount = arrearsMap[c.id] || 0;
      const retDate = c.retirement_date;
      const retirementRisk = retDate
        ? (new Date(retDate).getTime() - Date.now()) / (30 * 24 * 60 * 60 * 1000) < 12
        : false;

      let score = c.risk_score || 0;
      let level = 'low';
      if (hasArrears) { score = Math.max(score, 85) + Math.min(arrearsAmount / 1000, 15); level = 'critical'; }
      else if (phoneCount >= 2) { score = Math.max(score, 70); level = 'high'; }
      else { level = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low'; }
      if (retirementRisk && score < 100) score = Math.min(score + 15, 100);

      return {
        customerId: c.id, name: c.full_name || 'Unknown', rank: c.rank || '',
        branch: c.branch || '', campId: c.camp_id || '', campName: '',
        service_number: c.service_number || '', phone_number: c.phone_number || '',
        retirement_date: retDate || '', phoneCount, hasArrears, arrearsAmount,
        retirementRisk, isFlagged: hasArrears || phoneCount >= 2 || retirementRisk,
        risk_score: Math.round(Math.min(score, 100)), risk_level: level,
      };
    });

    // ── Filter, sort, paginate ──
    if (search) {
      allResult = allResult.filter(c =>
        (c.name || '').toLowerCase().includes(search) ||
        (c.service_number || '').toLowerCase().includes(search) ||
        (c.phone_number || '').toLowerCase().includes(search)
      );
    }

    allResult.sort((a, b) => b.risk_score - a.risk_score);
    const summary = allResult.reduce((acc, c) => {
      acc.total += 1;
      acc.critical += c.risk_level === 'critical' ? 1 : 0;
      acc.high += c.risk_level === 'high' ? 1 : 0;
      acc.medium += c.risk_level === 'medium' ? 1 : 0;
      acc.low += c.risk_level === 'low' ? 1 : 0;
      acc.flagged += c.isFlagged ? 1 : 0;
      acc.withArrears += c.hasArrears ? 1 : 0;
      acc.multiPhone += c.phoneCount >= 2 ? 1 : 0;
      acc.twoPhones += c.phoneCount === 2 ? 1 : 0;
      acc.totalArrearsAmount += c.arrearsAmount || 0;
      return acc;
    }, {
      total: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      flagged: 0,
      withArrears: 0,
      multiPhone: 0,
      twoPhones: 0,
      totalArrearsAmount: 0,
    } as {
      total: number;
      critical: number;
      high: number;
      medium: number;
      low: number;
      flagged: number;
      withArrears: number;
      multiPhone: number;
      twoPhones: number;
      totalArrearsAmount: number;
    });

    const total = summary.total;
    const pages = Math.ceil(total / limit);
    const pagedResult = allResult.slice((page - 1) * limit, page * limit);

    // Camp names only for this page
    const campIds = [...new Set(pagedResult.map(c => c.campId).filter(Boolean))];
    const campsRes = campIds.length > 0 ? await sb.from('camps').select('id, name').in('id', campIds) : { data: [] };
    const campMap = Object.fromEntries((campsRes.data || []).map((c: any) => [c.id, c.name]));
    pagedResult.forEach(c => { c.campName = campMap[c.campId] ?? c.branch ?? 'N/A'; });

    return reply.send({ data: pagedResult, total, page, limit, pages, summary });
  });

  /**
   * GET /dashboard/multi-phone-customers
   * Paginated list of customers who have 2+ phones.
   * Uses the `phones` table which has customer_id directly.
   */
  app.get('/multi-phone-customers', { preHandler: [authenticate] }, async (req, reply) => {
    const sb = getSupabase();
    const q = req.query as { page?: string; limit?: string; search?: string };
    const page  = Math.max(1, parseInt(q.page  || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(q.limit || '20')));
    const search = (q.search || '').trim().toLowerCase();

    // ── 1. Count phones per customer from `phones` table ──
    const CHUNK = 1000;
    const phoneCounts: Record<string, number> = {};
    let from = 0;
    while (true) {
      const { data: chunk, error } = await sb.from('phones')
        .select('id, customer_id')
        .not('customer_id', 'is', null)
        .is('deleted_at', null)
        .order('id')
        .range(from, from + CHUNK - 1);
      if (error || !chunk || chunk.length === 0) break;
      chunk.forEach((p: any) => {
        if (p.customer_id) phoneCounts[p.customer_id] = (phoneCounts[p.customer_id] || 0) + 1;
      });
      if (chunk.length < CHUNK) break;
      from += CHUNK;
    }

    // ── 2. Filter to customers with 2+ phones ──
    let multiPhoneIds = Object.entries(phoneCounts)
      .filter(([, count]) => count >= 2)
      .map(([id]) => id);

    if (multiPhoneIds.length === 0) {
      return reply.send({ data: [], total: 0, page, limit, pages: 0 });
    }

    // ── 3. Fetch customer details in chunks ──
    const allCustomers: any[] = [];
    for (let i = 0; i < multiPhoneIds.length; i += 400) {
      const ids = multiPhoneIds.slice(i, i + 400);
      const { data } = await sb.from('customers')
        .select('id, full_name, rank, branch, camp_id, service_number, phone_number, retirement_date, risk_score, risk_level')
        .in('id', ids)
        .is('deleted_at', null);
      if (data) allCustomers.push(...data);
    }

    // ── 4. Search filter ──
    let filtered = allCustomers;
    if (search) {
      filtered = allCustomers.filter(c =>
        (c.full_name || '').toLowerCase().includes(search) ||
        (c.service_number || '').toLowerCase().includes(search) ||
        (c.phone_number || '').toLowerCase().includes(search)
      );
    }

    // Sort by phone count desc
    filtered.sort((a, b) => (phoneCounts[b.id] || 0) - (phoneCounts[a.id] || 0));

    // ── 5. Paginate ──
    const total = filtered.length;
    const pages = Math.ceil(total / limit);
    const pageData = filtered.slice((page - 1) * limit, page * limit);

    // ── 6. Camp names for this page only ──
    const campIds = [...new Set(pageData.map((c: any) => c.camp_id).filter(Boolean))];
    const campsRes = campIds.length > 0
      ? await sb.from('camps').select('id, name').in('id', campIds)
      : { data: [] };
    const campMap = Object.fromEntries((campsRes.data || []).map((c: any) => [c.id, c.name]));

    const result = pageData.map((c: any) => ({
      customerId: c.id,
      name: c.full_name || 'Unknown',
      rank: c.rank || '',
      branch: c.branch || '',
      campId: c.camp_id || '',
      campName: campMap[c.camp_id] ?? c.branch ?? 'N/A',
      service_number: c.service_number || '',
      phone_number: c.phone_number || '',
      retirement_date: c.retirement_date || '',
      phoneCount: phoneCounts[c.id] || 0,
      risk_score: c.risk_score || 0,
      risk_level: c.risk_level || 'low',
    }));

    return reply.send({ data: result, total, page, limit, pages });
  });

  /**
   * POST /dashboard/weekly-summary
   * Generates an AI executive summary using OpenAI GPT-4o-mini.
   */
  app.post('/weekly-summary', { preHandler: [authenticate] }, async (req, reply) => {
    const sb = getSupabase();
    const body = req.body as { context?: string };
    const context = body?.context || 'executive_overview';

    const { count: totalCustomers } = await sb.from('customers').select('id', { count: 'exact', head: true }).is('deleted_at', null);
    const { count: pendingApps } = await sb.from('applications').select('id', { count: 'exact', head: true }).in('status', ['submitted', 'docs_review', 'camp_review']);

    // Get current month installments data
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

    // Multi-phone risk data — count from `phones` table (correct source)
    const { data: phonesData } = await sb.from('phones')
      .select('customer_id')
      .not('customer_id', 'is', null)
      .is('deleted_at', null);

    const phoneCountMap: Record<string, number> = {};
    (phonesData ?? []).forEach((p: any) => {
      if (p.customer_id) phoneCountMap[p.customer_id] = (phoneCountMap[p.customer_id] || 0) + 1;
    });
    const multiPhoneCustomers = Object.values(phoneCountMap).filter(c => c >= 2).length;

    const contextPrompts: Record<string, string> = {
      executive_overview: `You are a financial AI assistant for AIRVOICE Defence Finance Management. Provide a concise 4-5 sentence executive summary for the following real-time Sri Lankan military phone financing data. Highlight any risks and suggest one clear action. Do not use markdown formatting.\n\nData:\n- Total Military Customers: ${totalCustomers ?? 0}\n- Pending Applications: ${pendingApps ?? 0}\n- Expected Collections This Month: LKR ${expectedTotal.toLocaleString()}\n- Actual Collections This Month: LKR ${actualTotal.toLocaleString()}\n- Failed/Missed Installments: ${failureCount}\n- Customers with 2+ Active Phone Plans (Risk Flag): ${multiPhoneCustomers}`,

      collections: `You are a collections analyst for AIRVOICE. Analyze the following collection performance data and provide a 4-5 sentence professional summary with specific recommendations. No markdown formatting.\n\nCollections Data:\n- Expected: LKR ${expectedTotal.toLocaleString()}\n- Actual Collected: LKR ${actualTotal.toLocaleString()}\n- Collection Rate: ${expectedTotal > 0 ? ((actualTotal / expectedTotal) * 100).toFixed(1) : '100'}%\n- Missed/Failed Installments: ${failureCount}\n- Pending Applications Awaiting Approval: ${pendingApps ?? 0}`,

      expenses: `You are a finance controller for AIRVOICE Defence Finance. Provide a 4-5 sentence operational expenses analysis and cost control recommendations based on the current financial data. No markdown.\n\nData:\n- Total Active Military Customers: ${totalCustomers ?? 0}\n- Monthly Collections Target: LKR ${expectedTotal.toLocaleString()}\n- Actual Monthly Income: LKR ${actualTotal.toLocaleString()}\n- Uncollected Installments: ${failureCount}`,

      risk_recovery: `You are a risk analyst for AIRVOICE. Analyze the following risk indicators for a Sri Lankan military phone financing portfolio and provide a 4-5 sentence diagnostic with recovery action steps. No markdown.\n\nRisk Data:\n- Customers with 2+ Active Phone Plans: ${multiPhoneCustomers} (Credit Concentration Risk)\n- Failed/Missed Installments: ${failureCount}\n- Pending Applications: ${pendingApps ?? 0}\n- Collection Rate: ${expectedTotal > 0 ? ((actualTotal / expectedTotal) * 100).toFixed(1) : '100'}%`,

      commissions: `You are a sales performance analyst for AIRVOICE. Summarize the following sales and inventory performance data in 4-5 professional sentences. No markdown.\n\nSales Data:\n- Total Active Military Customers: ${totalCustomers ?? 0}\n- Active Phone Plans: ${(insts ?? []).length}\n- Multi-Phone Customers (2+ Plans): ${multiPhoneCustomers}\n- Monthly Collection Achievement: LKR ${actualTotal.toLocaleString()}`,
    };

    const prompt = contextPrompts[context] || contextPrompts.executive_overview;

    const summary = await generateAiSummary(prompt, 250);

    if (!summary) {
      const collRate = expectedTotal > 0 ? ((actualTotal / expectedTotal) * 100).toFixed(1) : '100';
      const fallbackStr = `[AI Offline Fallback] AirVoice currently has ${totalCustomers ?? 0} active customers and ${pendingApps ?? 0} pending applications. The monthly collection rate is ${collRate}% (LKR ${actualTotal.toLocaleString()} actual vs LKR ${expectedTotal.toLocaleString()} expected). There are ${failureCount} missed installments and ${multiPhoneCustomers} customers with multiple phone plans flagged for credit concentration risk. Please review flagged customers.`;

      return reply.send({ summary: fallbackStr });
    }

    return reply.send({ summary });
  });
}
