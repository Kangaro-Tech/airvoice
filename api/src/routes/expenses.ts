import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate, requireFinance, requireStaff } from '../middleware/auth';
import { getSupabase } from '../config/supabase';
import { notify } from '../services/notify';

const ALLOWED_MIME_TYPES = ['image/jpeg','image/png','image/webp','image/heic','application/pdf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function ext(mime: string): string {
  const map: Record<string,string> = {
    'image/jpeg':'jpg','image/png':'png','image/webp':'webp',
    'image/heic':'heic','application/pdf':'pdf',
  };
  return map[mime] ?? 'bin';
}

/** Call OpenAI GPT-4o-mini for expense AI assistant */
async function callGeminiChat(userMessage: string, context: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || !apiKey.startsWith('sk-')) {
    return generateLocalFallbackResponse(userMessage, context);
  }

  console.log('[AI] Using OpenAI GPT-4o-mini for Expense AI Assistant');

  const systemPrompt = `You are AIRVOICE AI, an intelligent expense management assistant for AIRVOICE mobile phone financing company in Sri Lanka. You help finance officers analyze expenses, spot anomalies, and manage budgets. You only answer questions related to AIRVOICE's expenses, budgets, and financial data. Keep answers concise and professional. Use LKR (Sri Lankan Rupees) for all amounts.

Current expense data context:
${context}`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 512,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[AI] OpenAI chat error:', errText);
      return generateLocalFallbackResponse(userMessage, context);
    }

    const data = await res.json() as any;
    return data.choices?.[0]?.message?.content?.trim() ?? generateLocalFallbackResponse(userMessage, context);
  } catch (err) {
    console.error('[AI] OpenAI chat exception:', err);
    return generateLocalFallbackResponse(userMessage, context);
  }
}


function generateLocalFallbackResponse(userMessage: string, context: string): string {
  const msg = userMessage.toLowerCase();
  
  // Extract info from context string using regex or simple parsing
  const monthMatch = context.match(/Month:\s*(.*)/);
  const monthStr = monthMatch ? monthMatch[1] : 'this month';

  const approvedMatch = context.match(/Total approved expenses:\s*LKR\s*([\d,]+)/);
  const approvedAmt = approvedMatch ? approvedMatch[1] : '0';

  const pendingMatch = context.match(/Total pending expenses:\s*LKR\s*([\d,]+)/);
  const pendingAmt = pendingMatch ? pendingMatch[1] : '0';

  const flaggedCountMatch = context.match(/Number of flagged suspicious expenses:\s*(\d+)/);
  const flaggedCount = flaggedCountMatch ? parseInt(flaggedCountMatch[1]) : 0;

  const budgetsMatch = context.match(/Budgets:\s*(.*)/);
  const budgetsList = budgetsMatch ? budgetsMatch[1] : '';

  const flaggedItemsMatch = context.match(/Flagged items:\s*(.*)/);
  const flaggedItemsList = flaggedItemsMatch ? flaggedItemsMatch[1] : '';

  if (msg.includes('flagged') || msg.includes('suspicious') || msg.includes('anomaly') || msg.includes('warning') || msg.includes('alert')) {
    if (flaggedCount === 0) {
      return `Good news! There are currently no flagged or suspicious expenses for ${monthStr}. All recorded transactions align with standard guidelines.`;
    }
    return `There are currently ${flaggedCount} flagged suspicious expense(s) for ${monthStr}. Specifically:
${flaggedItemsList.split(';').map(item => `• ${item.trim()}`).join('\n')}

These items have been flagged due to potential budget variance or unusual transaction descriptions. Please review them in the ledger above.`;
  }

  if (msg.includes('budget') || msg.includes('variance') || msg.includes('over')) {
    return `Here is a summary of the expense budgets for ${monthStr}:
• Budgets: ${budgetsList}
• Total Approved Spending: LKR ${approvedAmt}
• Total Pending Approval: LKR ${pendingAmt}

You can see the visual breakdown and variance in the "Budget vs Actual" chart above. Let me know if you need details on any specific category!`;
  }

  if (msg.includes('approved') || msg.includes('spend') || msg.includes('total') || msg.includes('summar') || msg.includes('june') || msg.includes('july')) {
    return `Here is the financial summary for ${monthStr}:
• **Total Approved Expenses**: LKR ${approvedAmt}
• **Total Pending Approval**: LKR ${pendingAmt}
• **Flagged Anomalies**: ${flaggedCount} item(s)

Currently, the ledger is up-to-date. You can download the full P&L Report or Deduction Sheet using the buttons at the top of the page.`;
  }

  if (msg.includes('pending') || msg.includes('approval')) {
    return `There are currently LKR ${pendingAmt} in pending expenses awaiting review. Finance officers can approve or reject these items directly from the ledger table below using the checkmark or cross buttons.`;
  }

  // General fallback
  return `Hi! I am the AIRVOICE AI Assistant. Based on the financial records for ${monthStr}:
• Approved Expenses: LKR ${approvedAmt}
• Pending Expenses: LKR ${pendingAmt}
• Suspicious/Flagged: ${flaggedCount} item(s)

Ask me about "flagged expenses", "budget summary", or "total spending" and I will be happy to assist you!`;
}


export default async function expenseRoutes(app: FastifyInstance) {

  // ── GET /expenses/categories ──────────────────────────────
  app.get('/categories', { preHandler:[authenticate,requireStaff] }, async (_req, reply) => {
    const {data} = await getSupabase().from('expense_categories').select('*').order('name');
    return reply.send({data});
  });

  // ── GET /expenses ─────────────────────────────────────────
  // Joins staff_registry to get submitter full name
  app.get('/', { preHandler:[authenticate,requireStaff] }, async (req:FastifyRequest, reply) => {
    const q = req.query as {status?:string;category_id?:string;from?:string;to?:string;page?:string};
    const page=parseInt(q.page??'1'), limit=50;
    let query = getSupabase().from('expenses')
      .select(
        `*,
         category:expense_categories(name,type),
         submitter:staff_registry(full_name,designation)`,
        {count:'exact'}
      )
      .is('deleted_at',null)
      .order('expense_date',{ascending:false})
      .range((page-1)*limit, page*limit-1);
    if (q.status) query = query.eq('status',q.status);
    if (q.category_id) query = query.eq('category_id',q.category_id);
    if (q.from) query = query.gte('expense_date',q.from);
    if (q.to)   query = query.lte('expense_date',q.to);
    const {data,count,error} = await query;
    if (error) {
      // Fallback without staff join if staff_registry not linked
      let q2 = getSupabase().from('expenses')
        .select('*,category:expense_categories(name,type)',{count:'exact'})
        .is('deleted_at',null).order('expense_date',{ascending:false}).range((page-1)*limit,page*limit-1);
      if (q.status) q2 = q2.eq('status',q.status);
      if (q.category_id) q2 = q2.eq('category_id',q.category_id);
      if (q.from) q2 = q2.gte('expense_date',q.from);
      if (q.to)   q2 = q2.lte('expense_date',q.to);
      const {data:d2,count:c2} = await q2;
      return reply.send({data:d2,meta:{total:c2,page,limit}});
    }
    return reply.send({data,meta:{total:count,page,limit}});
  });

  // ── POST /expenses ────────────────────────────────────────
  app.post('/', { preHandler:[authenticate,requireStaff] }, async (req:FastifyRequest, reply) => {
    const body = z.object({
      category_id:z.string().uuid(), amount:z.number().positive(),
      description:z.string().min(3), expense_date:z.string().date(),
      notes:z.string().optional(),
      payment_method:z.string().optional().default('Cash'),
      receipt_reference:z.string().optional(),
    }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({error:'Validation Error',details:body.error.flatten()});
    const {data,error} = await getSupabase().from('expenses').insert({...body.data,submitted_by:req.user!.id,status:'pending'}).select().single();
    if (error) return reply.status(500).send({error:error.message});
    const { data: cat } = await getSupabase().from('expense_categories').select('name').eq('id', body.data.category_id).single();
    notify({ kind: 'expense_pending', amount: body.data.amount, categoryName: cat?.name ?? 'Unknown' }).catch(() => {});
    return reply.status(201).send({data});
  });

  // ── POST /expenses/:id/approve ────────────────────────────
  app.post('/:id/approve', { preHandler:[authenticate,requireFinance] }, async (req:FastifyRequest, reply) => {
    const {id} = req.params as {id:string};
    const body = z.object({action:z.enum(['approve','reject']),reason:z.string().optional()}).safeParse(req.body);
    if (!body.success) return reply.status(400).send({error:'Validation Error'});
    const updates = body.data.action==='approve'
      ? {status:'approved',approved_by:req.user!.id,approved_at:new Date().toISOString()}
      : {status:'rejected',rejected_reason:body.data.reason};
    const {data,error} = await getSupabase().from('expenses').update(updates).eq('id',id).select().single();
    if (error) return reply.status(500).send({error:error.message});
    return reply.send({data});
  });

  // ── POST /expenses/:id/receipt ────────────────────────────
  // Upload a receipt image/PDF for an expense (multipart/form-data, field: file)
  app.post('/:id/receipt', { preHandler:[authenticate,requireStaff] }, async (req:FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    const sb = getSupabase();

    // Verify the expense exists and belongs to this user (or they are finance/admin)
    const { data: expense } = await sb.from('expenses').select('id,submitted_by,status').eq('id',id).single();
    if (!expense) return reply.status(404).send({error:'Expense not found'});

    const user = req.user!;
    const isOwner = expense.submitted_by === user.id;
    const isFinance = ['finance_officer','admin','super_admin','accountant','system_operator'].includes(user.role);
    if (!isOwner && !isFinance) return reply.status(403).send({error:'Forbidden'});

    const parts = req.parts();
    let fileBuffer: Buffer | null = null;
    let originalFilename = '';
    let mimeType = '';
    let fileSize = 0;

    for await (const part of parts) {
      if (part.type === 'file') {
        mimeType = part.mimetype;
        originalFilename = part.filename;
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) chunks.push(chunk);
        fileBuffer = Buffer.concat(chunks);
        fileSize = fileBuffer.length;
      }
    }

    if (!fileBuffer || fileSize === 0) return reply.status(400).send({error:'No file uploaded'});
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) return reply.status(400).send({error:'Unsupported file type. Allowed: JPEG, PNG, WEBP, HEIC, PDF'});
    if (fileSize > MAX_FILE_SIZE) return reply.status(400).send({error:'File too large. Max 10 MB'});

    const storagePath = `expenses/${id}/receipt_${Date.now()}.${ext(mimeType)}`;
    const { error: uploadErr } = await sb.storage
      .from('customer_documents')
      .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: true });

    if (uploadErr) return reply.status(500).send({error:'Upload failed', message: uploadErr.message});

    // Generate a signed URL (15 min)
    const { data: signed } = await sb.storage.from('customer_documents').createSignedUrl(storagePath, 900);

    // Update expense record with receipt path
    const { data: updated, error: updateErr } = await sb.from('expenses')
      .update({ receipt_document_id: null, receipt_reference: `receipt:${storagePath}` })
      .eq('id', id).select().single();
    if (updateErr) return reply.status(500).send({error: updateErr.message});

    return reply.status(201).send({
      data: {
        ...updated,
        receipt_url: signed?.signedUrl ?? null,
        storage_path: storagePath,
        original_filename: originalFilename,
      },
    });
  });

  // ── GET /expenses/:id/receipt ─────────────────────────────
  // Retrieve signed URL for viewing an expense receipt
  app.get('/:id/receipt', { preHandler:[authenticate,requireStaff] }, async (req:FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    const sb = getSupabase();

    // Get the expense
    const { data: expense, error: expenseErr } = await sb
      .from('expenses')
      .select('id,submitted_by,receipt_reference')
      .eq('id', id)
      .single();
    
    if (expenseErr || !expense) return reply.status(404).send({ error: 'Expense not found' });

    // Check access
    const user = req.user!;
    const isOwner = expense.submitted_by === user.id;
    const isFinance = ['finance_officer','admin','super_admin','accountant','system_operator'].includes(user.role);
    if (!isOwner && !isFinance) return reply.status(403).send({ error: 'Forbidden' });

    // Check if receipt exists
    if (!expense.receipt_reference) return reply.status(404).send({ error: 'No receipt found for this expense' });

    // Parse storage path from receipt_reference (format: "receipt:expenses/{id}/receipt_{timestamp}.{ext}")
    const storagePath = expense.receipt_reference.replace(/^receipt:/, '');
    
    // Generate signed URL (15 min validity)
    const { data: signed, error: urlErr } = await sb.storage
      .from('customer_documents')
      .createSignedUrl(storagePath, 900);

    if (urlErr || !signed) return reply.status(500).send({ error: 'Failed to generate receipt URL', message: urlErr?.message });

    return reply.send({
      data: {
        receipt_url: signed.signedUrl,
        storage_path: storagePath,
        filename: storagePath.split('/').pop() ?? 'receipt',
      },
    });
  });

  // ── GET /expenses/budget/summary ──────────────────────────
  app.get('/budget/summary', { preHandler:[authenticate,requireFinance] }, async (req:FastifyRequest, reply) => {
    const q = req.query as {month?:string};
    const month = q.month ? new Date(q.month) : new Date();
    const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
    const monthEnd   = new Date(month.getFullYear(), month.getMonth() + 1, 0);

    const {data:categories} = await getSupabase().from('expense_categories').select('*').eq('type','expense');
    const {data:budgets} = await getSupabase().from('expense_budgets')
      .select('*')
      .gte('budget_month', monthStart.toISOString().split('T')[0])
      .lte('budget_month', monthEnd.toISOString().split('T')[0]);
    const {data:expenses} = await getSupabase().from('expenses')
      .select('*,category:expense_categories(name,type)')
      .gte('expense_date', monthStart.toISOString().split('T')[0])
      .lte('expense_date', monthEnd.toISOString().split('T')[0])
      .eq('status', 'approved')
      .is('deleted_at', null);

    const summary = (categories || []).map((cat:any) => {
      const budget = (budgets || []).find(b => b.category_id === cat.id)?.budgeted_amount || 0;
      const actual = (expenses || [])
        .filter(e => e.category_id === cat.id)
        .reduce((sum, e) => sum + (e.amount || 0), 0);
      return {
        category_id:   cat.id,
        category_name: cat.name,
        budgeted:      parseFloat(budget),
        actual:        parseFloat(actual),
        variance:      parseFloat(budget) - parseFloat(actual),
        variance_pct:  budget > 0 ? Math.round(((parseFloat(budget) - parseFloat(actual)) / parseFloat(budget)) * 100) : 0,
      };
    });

    return reply.send({data: summary, month: monthStart.toISOString().split('T')[0]});
  });

  // ── GET /expenses/alerts/flagged ──────────────────────────
  app.get('/alerts/flagged', { preHandler:[authenticate,requireFinance] }, async (_req, reply) => {
    const {data:flagged} = await getSupabase().from('expenses')
      .select('*,category:expense_categories(name,type)')
      .eq('is_suspicious', true)
      .is('deleted_at', null)
      .order('created_at', {ascending:false})
      .limit(10);

    if (!flagged || flagged.length === 0) return reply.send({data: null});

    const top = flagged[0];
    return reply.send({
      data: {
        count: flagged.length,
        topExpense: {
          id:          top.id,
          amount:      top.amount,
          description: top.description,
          category:    top.category?.name,
          reason:      top.flagged_reason,
          date:        top.expense_date,
        },
        all: flagged.map(f => ({
          id:f.id, amount:f.amount, description:f.description,
          category:f.category?.name, reason:f.flagged_reason, date:f.expense_date,
        })),
      }
    });
  });

  // ── POST /expenses/chat ───────────────────────────────────
  // AIRVOICE AI Assistant for expense questions
  app.post('/chat', { preHandler:[authenticate,requireStaff] }, async (req:FastifyRequest, reply) => {
    const body = z.object({
      message: z.string().min(1).max(500),
      month:   z.string().optional(),
    }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({error:'Validation Error'});

    const sb = getSupabase();
    const month = body.data.month ? new Date(body.data.month) : new Date();
    const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
    const monthEnd   = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const msStr = monthStart.toISOString().split('T')[0];
    const meStr = monthEnd.toISOString().split('T')[0];

    // Gather real data for context
    const [{data:expenses},{data:budgets},{data:flagged}] = await Promise.all([
      sb.from('expenses')
        .select('amount,description,expense_date,status,is_suspicious,flagged_reason,category:expense_categories(name)')
        .gte('expense_date', msStr).lte('expense_date', meStr).is('deleted_at',null).limit(50),
      sb.from('expense_budgets')
        .select('budgeted_amount,category:expense_categories(name)')
        .gte('budget_month', msStr).lte('budget_month', meStr),
      sb.from('expenses')
        .select('amount,description,flagged_reason,category:expense_categories(name)')
        .eq('is_suspicious',true).is('deleted_at',null).limit(5),
    ]);

    const totalApproved = (expenses||[]).filter(e=>e.status==='approved').reduce((s,e)=>s+e.amount,0);
    const totalPending  = (expenses||[]).filter(e=>e.status==='pending').reduce((s,e)=>s+e.amount,0);
    const context = [
      `Month: ${month.toLocaleString('default',{month:'long',year:'numeric'})}`,
      `Total approved expenses: LKR ${totalApproved.toLocaleString()}`,
      `Total pending expenses: LKR ${totalPending.toLocaleString()}`,
      `Number of flagged suspicious expenses: ${(flagged||[]).length}`,
      `Budgets: ${(budgets||[]).map((b:any)=>`${b.category?.name}: LKR ${b.budgeted_amount}`).join(', ')}`,
      `Flagged items: ${(flagged||[]).map((f:any)=>`${f.category?.name} LKR ${f.amount} — ${f.flagged_reason}`).join('; ')}`,
      `Recent expenses (up to 10): ${(expenses||[]).slice(0,10).map(e=>`${(e as any).category?.name} LKR ${e.amount} (${e.status})`).join(', ')}`,
    ].join('\n');

    const answer = await callGeminiChat(body.data.message, context);
    return reply.send({ data: { answer, context_month: msStr } });
  });
}
