import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate, requireStaff } from '../middleware/auth';
import { getSupabase } from '../config/supabase';

// ── Zod schemas ────────────────────────────────────────────────────────

const FieldSchema = z.object({
  label:             z.string(),
  xMm:               z.number(),
  yMm:               z.number(),
  fontSizePt:        z.number(),
  letterSpacingMm:   z.number().default(0),
  bold:              z.boolean().default(false),
  visible:           z.boolean().default(true),
  format:            z.string().optional(),      // for date field
  maxChars:          z.number().optional(),      // for amountWordsLine1
  prefix:            z.string().optional(),      // for amountFigures
  useCommas:         z.boolean().optional(),     // for amountFigures
  securityAsterisks: z.boolean().optional(),     // for amountFigures
  decimalPlaces:     z.number().optional(),      // for amountFigures
});

const FieldsJsonSchema = z.object({
  date:              FieldSchema,
  payee:             FieldSchema,
  amountWordsLine1:  FieldSchema,
  amountWordsLine2:  FieldSchema,
  amountFigures:     FieldSchema,
  accountPayeeOnly:  FieldSchema,
  memo:              FieldSchema,
});

const CreateBankSchema = z.object({
  name:              z.string().min(1).max(120),
  cheque_width_mm:   z.number().positive().default(190),
  cheque_height_mm:  z.number().positive().default(85),
  fields_json:       FieldsJsonSchema,
});

const UpdateBankSchema = z.object({
  name:              z.string().min(1).max(120).optional(),
  cheque_width_mm:   z.number().positive().optional(),
  cheque_height_mm:  z.number().positive().optional(),
  fields_json:       FieldsJsonSchema.optional(),
});

const PrintHistorySchema = z.object({
  bank_template_id:  z.string().uuid().optional(),
  bank_name:         z.string().min(1),
  cheque_no:         z.string().max(30).optional(),
  cheque_date:       z.string().date().optional(),
  payee:             z.string().min(1).max(200),
  amount:            z.number().positive(),
  amount_words:      z.string().optional(),
  memo:              z.string().max(200).optional(),
  ac_payee_only:     z.boolean().default(false),
});

// ── Route plugin ────────────────────────────────────────────────────────

export default async function chequeRoutes(app: FastifyInstance) {

  // ── GET /cheque/banks ─────────────────────────────────────────────
  // Returns global defaults + the requesting user's custom templates.
  app.get('/banks', {
    preHandler: [authenticate, requireStaff],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const supabase = getSupabase();
    const userId = request.user!.id;

    const { data, error } = await supabase
      .from('cheque_bank_templates')
      .select('id, name, cheque_width_mm, cheque_height_mm, fields_json, is_global_default, user_id, created_at, updated_at')
      .is('deleted_at', null)
      .or(`is_global_default.eq.true,user_id.eq.${userId}`)
      .order('is_global_default', { ascending: false })
      .order('name', { ascending: true });

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ data });
  });

  // ── POST /cheque/banks ────────────────────────────────────────────
  // Create a user-specific custom bank template.
  app.post('/banks', {
    preHandler: [authenticate, requireStaff],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = CreateBankSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parsed.error.flatten() });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('cheque_bank_templates')
      .insert({
        user_id:          request.user!.id,
        name:             parsed.data.name,
        cheque_width_mm:  parsed.data.cheque_width_mm,
        cheque_height_mm: parsed.data.cheque_height_mm,
        fields_json:      parsed.data.fields_json,
        is_global_default: false,
      })
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });
    return reply.status(201).send({ data });
  });

  // ── PUT /cheque/banks/:id ─────────────────────────────────────────
  // Update a bank template. Users can only update their own templates,
  // not the global defaults.
  app.put('/banks/:id', {
    preHandler: [authenticate, requireStaff],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateBankSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parsed.error.flatten() });
    }

    const supabase = getSupabase();
    const userId = request.user!.id;

    // Fetch template and check ownership
    const { data: existing } = await supabase
      .from('cheque_bank_templates')
      .select('id, user_id, is_global_default')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (!existing) return reply.status(404).send({ error: 'Bank template not found' });

    // Global defaults cannot be edited — user must duplicate first
    if (existing.is_global_default) {
      return reply.status(422).send({
        error: 'Cannot edit global template',
        message: 'Duplicate the bank template first to create your own editable copy.',
      });
    }

    if (existing.user_id !== userId) {
      return reply.status(403).send({ error: 'Forbidden — not your template' });
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined)             updates.name             = parsed.data.name;
    if (parsed.data.cheque_width_mm !== undefined)  updates.cheque_width_mm  = parsed.data.cheque_width_mm;
    if (parsed.data.cheque_height_mm !== undefined) updates.cheque_height_mm = parsed.data.cheque_height_mm;
    if (parsed.data.fields_json !== undefined)      updates.fields_json      = parsed.data.fields_json;

    const { data, error } = await supabase
      .from('cheque_bank_templates')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ data });
  });

  // ── DELETE /cheque/banks/:id ──────────────────────────────────────
  // Soft-delete a user's own bank template.
  app.delete('/banks/:id', {
    preHandler: [authenticate, requireStaff],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const supabase = getSupabase();
    const userId = request.user!.id;

    const { data: existing } = await supabase
      .from('cheque_bank_templates')
      .select('id, user_id, is_global_default')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (!existing) return reply.status(404).send({ error: 'Bank template not found' });
    if (existing.is_global_default) {
      return reply.status(422).send({ error: 'Cannot delete a global default template' });
    }
    if (existing.user_id !== userId) {
      return reply.status(403).send({ error: 'Forbidden — not your template' });
    }

    await supabase
      .from('cheque_bank_templates')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    return reply.send({ success: true });
  });

  // ── GET /cheque/history ───────────────────────────────────────────
  // Paginated print history for the current user.
  app.get('/history', {
    preHandler: [authenticate, requireStaff],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { page?: string; limit?: string; search?: string };
    const supabase = getSupabase();
    const userId = request.user!.id;
    const page   = Math.max(1, parseInt(query.page  ?? '1',  10));
    const limit  = Math.min(100, parseInt(query.limit ?? '50', 10));
    const offset = (page - 1) * limit;

    let q = supabase
      .from('cheque_print_history')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('printed_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (query.search) {
      const s = `%${query.search}%`;
      q = q.or(`payee.ilike.${s},cheque_no.ilike.${s},bank_name.ilike.${s}`);
    }

    const { data, error, count } = await q;
    if (error) return reply.status(500).send({ error: error.message });

    return reply.send({
      data,
      meta: { total: count ?? 0, page, limit, pages: Math.ceil((count ?? 0) / limit) },
    });
  });

  // ── POST /cheque/history ──────────────────────────────────────────
  // Record a new print event.
  app.post('/history', {
    preHandler: [authenticate, requireStaff],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = PrintHistorySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parsed.error.flatten() });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('cheque_print_history')
      .insert({
        user_id:          request.user!.id,
        bank_template_id: parsed.data.bank_template_id ?? null,
        bank_name:        parsed.data.bank_name,
        cheque_no:        parsed.data.cheque_no ?? null,
        cheque_date:      parsed.data.cheque_date ?? null,
        payee:            parsed.data.payee,
        amount:           parsed.data.amount,
        amount_words:     parsed.data.amount_words ?? null,
        memo:             parsed.data.memo ?? null,
        ac_payee_only:    parsed.data.ac_payee_only,
      })
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });
    return reply.status(201).send({ data });
  });

  // ── DELETE /cheque/history/:id ────────────────────────────────────
  // Delete a single history entry (must belong to caller).
  app.delete('/history/:id', {
    preHandler: [authenticate, requireStaff],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const supabase = getSupabase();
    const userId = request.user!.id;

    const { data: existing } = await supabase
      .from('cheque_print_history')
      .select('id, user_id')
      .eq('id', id)
      .single();

    if (!existing) return reply.status(404).send({ error: 'History entry not found' });
    if (existing.user_id !== userId) return reply.status(403).send({ error: 'Forbidden' });

    await supabase.from('cheque_print_history').delete().eq('id', id);
    return reply.send({ success: true });
  });

  // ── DELETE /cheque/history ────────────────────────────────────────
  // Clear ALL history for the current user.
  app.delete('/history', {
    preHandler: [authenticate, requireStaff],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const supabase = getSupabase();
    await supabase
      .from('cheque_print_history')
      .delete()
      .eq('user_id', request.user!.id);

    return reply.send({ success: true });
  });
}
