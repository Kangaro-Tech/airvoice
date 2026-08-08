import { FastifyPluginAsync } from 'fastify';
import OpenAI from 'openai';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';


const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string()
  })).optional().default([]),
});

// ── Fetch live system context from Supabase ────────────────────────────────
async function fetchSystemContext(): Promise<string> {
  try {
    const [customers, camps, phones, applications] = await Promise.all([
      sb.from('customers').select('id', { count: 'exact', head: true }),
      sb.from('camps').select('id, name', { count: 'exact' }).limit(20),
      sb.from('phones').select('id, model', { count: 'exact' }).limit(30),
      sb.from('applications').select('id, status', { count: 'exact' }).limit(1),
    ]);

    const campNames = (camps.data ?? []).map((c: any) => c.name).join(', ');
    const phoneModels = [...new Set((phones.data ?? []).map((p: any) => p.model))].join(', ');

    return `
LIVE SYSTEM DATA (as of now):
- Total Customers: ${customers.count ?? 'N/A'}
- Total Camps: ${camps.count ?? 'N/A'}
- Known camps: ${campNames || 'N/A'}
- Phone models in inventory: ${phoneModels || 'N/A'}
- Total Applications: ${applications.count ?? 'N/A'}
    `.trim();
  } catch {
    return 'Live system data unavailable.';
  }
}

const BASE_SYSTEM_PROMPT = `You are a professional, friendly AI support assistant for AirVoice — a Defence Finance Management System used in Sri Lanka.

Your primary goal is to help users of the AirVoice web-admin system with:
1. Uploading Deduction Sheets and Unit Wise Summaries (Excel uploads)
2. Managing phone sales, inventory, and customers
3. Company payment deduction workflows
4. Attendance and HR records
5. Reports, commissions, and finances
6. Red-flag/risk system for customers with overdue payments
7. Camp and guarantor management

Guidelines:
- Be concise and clear. Use bullet points for step-by-step instructions.
- Use **bold** for important terms, column names, and button names.
- If the user asks something unrelated to AirVoice, politely redirect them.
- When giving upload instructions, mention required column names explicitly.
- Answer in the same language the user writes in (Sinhala or English).`;

const chatRoutes: FastifyPluginAsync = async (app) => {
  // ── Help Center Login ──────────────────────────────────────────────────────
  app.post('/login', async (req, reply) => {
    const loginSchema = z.object({
      phone: z.string(),
      pin: z.string()
    });
    
    try {
      const { phone, pin } = loginSchema.parse(req.body);
      
      // Simple master PIN for Help Center staff access
      const MASTER_PIN = process.env.HELP_CENTER_PIN || '889900';
      if (pin !== MASTER_PIN) {
        return reply.status(401).send({ success: false, error: 'Invalid Staff PIN' });
      }

      // Verify if user is staff
      const { data: user, error } = await sb
        .from('users')
        .select('role, is_active, staff:staff_registry(full_name)')
        .eq('phone_number', phone)
        .single();

      if (error || !user) {
        return reply.status(404).send({ success: false, error: 'Staff member not found with this phone number' });
      }
      
      if (!user.is_active) {
        return reply.status(403).send({ success: false, error: 'Account is deactivated' });
      }

      // Check role (allow admin, system-operator, camp_officer)
      const allowedRoles = ['admin', 'system-operator', 'camp_officer'];
      if (!allowedRoles.includes(user.role)) {
        return reply.status(403).send({ success: false, error: 'Access denied: Staff only' });
      }

      const staffArr = (user as any)?.staff;
      const fullName = Array.isArray(staffArr) ? staffArr[0]?.full_name : staffArr?.full_name;

      return reply.send({
        success: true,
        user: { role: user.role, name: fullName || 'Staff Member', phone }
      });

    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // ── Chat Completion ────────────────────────────────────────────────────────
  app.post('/', {
    config: {
      rateLimit: {
        max: 15,
        timeWindow: '1 minute',
      },
    },
  }, async (req, reply) => {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return reply.status(503).send({ success: false, error: 'OpenAI API key is not configured on the server.' });
      }
      const openai = new OpenAI({ apiKey });
      const { message, history } = chatSchema.parse(req.body);

      // Fetch live Supabase context for richer answers
      const systemContext = await fetchSystemContext();

      const fullSystemPrompt = `${BASE_SYSTEM_PROMPT}\n\n${systemContext}`;

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: fullSystemPrompt },
        ...history.slice(-10), // keep last 10 messages for context window
        { role: 'user', content: message }
      ];

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.65,
        max_tokens: 1200,
      });

      const replyText = response.choices[0]?.message?.content
        ?? "I'm sorry, I couldn't process your request right now.";

      return reply.send({ success: true, reply: replyText });
    } catch (err: any) {
      req.log.error(err, 'Chat route error');
      return reply.status(500).send({
        success: false,
        error: err?.message ?? 'AI service unavailable'
      });
    }
  });
};

export default chatRoutes;
