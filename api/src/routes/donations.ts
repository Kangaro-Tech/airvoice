import { FastifyInstance } from 'fastify';
import { getSupabase } from '../config/supabase';

interface DonationBody {
  date: string;
  completed_paid_phone_count: number;
  percentage?: number;
  chq_no?: string;
  chq_amount?: number;
  delivery?: string;
  sending_date?: string;
}

export default async function (app: FastifyInstance) {
  
  app.get('/', async (request, reply) => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('donations')
      .select('*')
      .order('date', { ascending: false });

    if (error) {
      return reply.status(500).send({ error: 'DatabaseError', message: error.message });
    }
    return reply.send(data);
  });

  app.post<{ Body: DonationBody }>('/', async (request, reply) => {
    const supabase = getSupabase();
    const body = request.body;

    const { data, error } = await supabase
      .from('donations')
      .insert([{
        date: body.date,
        completed_paid_phone_count: body.completed_paid_phone_count,
        percentage: body.percentage ?? 3.0,
        chq_no: body.chq_no,
        chq_amount: body.chq_amount,
        delivery: body.delivery,
        sending_date: body.sending_date
      }])
      .select()
      .single();

    if (error) {
      return reply.status(400).send({ error: 'DatabaseError', message: error.message });
    }
    return reply.status(201).send(data);
  });

  app.put<{ Params: { id: string }, Body: DonationBody }>('/:id', async (request, reply) => {
    const supabase = getSupabase();
    const { id } = request.params;
    const body = request.body;

    const { data, error } = await supabase
      .from('donations')
      .update({
        date: body.date,
        completed_paid_phone_count: body.completed_paid_phone_count,
        percentage: body.percentage,
        chq_no: body.chq_no,
        chq_amount: body.chq_amount,
        delivery: body.delivery,
        sending_date: body.sending_date,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return reply.status(400).send({ error: 'DatabaseError', message: error.message });
    }
    return reply.send(data);
  });

  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const supabase = getSupabase();
    const { id } = request.params;

    const { error } = await supabase
      .from('donations')
      .delete()
      .eq('id', id);

    if (error) {
      return reply.status(400).send({ error: 'DatabaseError', message: error.message });
    }
    return reply.send({ success: true });
  });

}
