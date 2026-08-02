import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate, requireRole, requireStaff } from '../middleware/auth';
import { getSupabase } from '../config/supabase';
import { notify } from '../services/notify';

export default async function inventoryRoutes(app: FastifyInstance) {
  // Phone models with stock counts
  app.get('/models', { preHandler:[authenticate,requireStaff] }, async (_req, reply) => {
    const {data} = await getSupabase().from('phone_models')
      .select('*').eq('is_active',true).order('brand');
    const sb = getSupabase();
    const withCounts = await Promise.all((data??[]).map(async (model:Record<string,any>) => {
      const {count:inStock} = await sb.from('phones').select('id',{count:'exact',head:true}).eq('model_id',model.id as string).eq('status','in_stock');
      const {count:sold}    = await sb.from('phones').select('id',{count:'exact',head:true}).eq('model_id',model.id as string).eq('status','sold');
      // Build signed URLs for images stored in Supabase Storage
      const specs = model.specifications || {};
      const rawImages: string[] = Array.isArray(specs.images) ? specs.images : (specs.image_url ? [specs.image_url] : []);
      const images = await Promise.all(
        rawImages.map(async (path: string) => {
          if (path.startsWith('http')) return path; // already a URL
          const { data: sd } = await sb.storage.from('phone-images').createSignedUrl(path, 3600);
          return sd?.signedUrl ?? path;
        })
      );
      return {
        ...model,
        description: specs.description || null,
        specs: specs,
        images,
        in_stock:inStock??0,
        sold:sold??0
      };
    }));
    return reply.send({data:withCounts});
  });

  app.post('/models', { preHandler:[authenticate,requireStaff] }, async (req:FastifyRequest, reply) => {
    const body = z.object({
      brand:z.string(),
      model:z.string(),
      storage:z.string().optional(),
      color:z.string().optional(),
      sale_price:z.number(),
      purchase_cost:z.number().optional(),
      description:z.string().optional(),
      image_url:z.string().optional(),
      specs:z.record(z.string()).optional()
    }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({error:'Validation Error'});

    const specifications = {
      ...(body.data.specs || {}),
      description: body.data.description || null,
      image_url: body.data.image_url || null
    };

    const insertData = {
      brand: body.data.brand,
      model: body.data.model,
      storage: body.data.storage,
      color: body.data.color,
      sale_price: body.data.sale_price,
      purchase_cost: body.data.purchase_cost,
      specifications
    };

    const {data,error} = await getSupabase().from('phone_models').insert(insertData as any).select().single();
    if (error) return reply.status(500).send({error:error.message});
    return reply.status(201).send({data});
  });

  // Low stock alerts (models with < 5 in stock)
  app.get('/low-stock', { preHandler:[authenticate,requireStaff] }, async (_req, reply) => {
    const sb = getSupabase();
    const {data:models} = await sb.from('phone_models').select('*').eq('is_active',true);
    const low = [];
    for (const m of (models??[])) {
      const {count} = await sb.from('phones').select('id',{count:'exact',head:true}).eq('model_id',(m as Record<string,unknown>).id as string).eq('status','in_stock');
      if ((count??0) < 5) {
        const specs = (m as any).specifications || {};
        low.push({
          ...m as any,
          description: specs.description || null,
          image_url: specs.image_url || null,
          specs: specs,
          in_stock:count??0
        });
      }
    }
    return reply.send({data:low});
  });

  // Stock orders
  app.get('/stock-orders', { preHandler:[authenticate,requireStaff] }, async (_req, reply) => {
    const {data} = await getSupabase().from('stock_orders')
      .select('*,model:phone_models(brand,model),supplier:suppliers(name)')
      .order('created_at',{ascending:false}).limit(50);
    return reply.send({data:data as any});
  });

  app.post('/stock-orders', { preHandler:[authenticate,requireStaff] }, async (req:FastifyRequest, reply) => {
    const body = z.object({model_id:z.string().uuid(),quantity:z.number().int().positive(),supplier_id:z.string().uuid().optional(),unit_price:z.number().optional(),notes:z.string().optional()}).safeParse(req.body);
    if (!body.success) return reply.status(400).send({error:'Validation Error'});
    const {data,error} = await getSupabase().from('stock_orders').insert({...body.data,requested_by:req.user!.id,status:'pending'} as any).select('*,model:phone_models(brand,model)').single();
    if (error) return reply.status(500).send({error:error.message});
    const modelName = `${(data as any).model?.brand ?? ''} ${(data as any).model?.model ?? ''}`.trim();
    notify({ kind: 'stock_order_placed', modelName: modelName || 'Unknown Model', qty: body.data.quantity, orderedBy: req.user!.id });
    return reply.status(201).send({data});
  });

  // PATCH /inventory/stock-orders/:id — update stock order status
  app.patch('/stock-orders/:id', { preHandler:[authenticate,requireStaff] }, async (req:FastifyRequest, reply:FastifyReply) => {
    const {id} = req.params as {id:string};
    const body = z.object({
      status: z.enum(['pending', 'approved', 'ordered', 'received', 'cancelled'])
    }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({error:'Validation Error',details:body.error.flatten()});
    
    // Check if stock order exists
    const {data: order, error: fetchErr} = await getSupabase().from('stock_orders').select('*').eq('id',id).single();
    if (fetchErr || !order) return reply.status(404).send({error:'Stock order not found'});

    const updates: Record<string, any> = {
      status: body.data.status,
      updated_at: new Date().toISOString()
    };
    if (body.data.status === 'approved') {
      updates.approved_by = req.user!.id;
      updates.approved_at = new Date().toISOString();
    }
    if (body.data.status === 'received') {
      updates.received_at = new Date().toISOString();
    }

    const sb = getSupabase();
    const {data,error} = await sb.from('stock_orders').update(updates as any).eq('id',id).select('*,model:phone_models(brand,model,storage)').single();
    if (error) return reply.status(500).send({error:error.message});

    // Auto-generate devices in the phones table when marked as received
    if (body.data.status === 'received' && order.status !== 'received') {
      const qty = order.quantity;
      const modelId = order.model_id;
      
      const phoneInserts = [];
      const timestamp = Date.now();
      for (let i = 0; i < qty; i++) {
        // Generate a 15 digit unique IMEI starting with '990000' + order-specific numbers + index
        const randStr = Math.floor(100000000 + Math.random() * 900000000).toString();
        const imei_1 = `990000${randStr}`.slice(0, 15);
        phoneInserts.push({
          model_id: modelId,
          imei_1,
          status: 'in_stock',
          purchase_cost: order.unit_price || 0,
          stock_location: 'Colombo HQ',
          notes: `Auto-generated from Stock Order: ${id}`,
          received_by: req.user!.id,
        });
      }
      
    const { error: insertErr } = await sb.from('phones').insert(phoneInserts as any);
      if (insertErr) {
        req.log.error(insertErr, '[STOCK RECEIVED] Failed to auto-generate phone devices');
      } else {
        const modelName = `${(data as any).model?.brand ?? ''} ${(data as any).model?.model ?? ''}`.trim();
        notify({ kind: 'stock_added', modelName, imei: `Auto-generated ${qty} units`, qty, addedBy: req.user!.id });
      }
    }
    
    const modelName = `${(data as any).model?.brand ?? ''} ${(data as any).model?.model ?? ''}`.trim();
    notify({ kind: 'inventory_updated', modelName, field: `stock order status: ${body.data.status}`, updatedBy: req.user!.id });
    
    return reply.send({data});
  });

  // ── PATCH /inventory/models/:id — update phone model ──────
  app.patch('/models/:id', { preHandler:[authenticate,requireRole('inventory_manager','admin','super_admin','system_operator')] },
  async (req:FastifyRequest, reply:FastifyReply) => {
    const {id} = req.params as {id:string};
    const body = z.object({
      brand:      z.string().min(1).optional(),
      model:      z.string().min(1).optional(),
      storage:    z.string().optional().nullable(),
      color:      z.string().optional().nullable(),
      base_price: z.number().positive().optional(),
      sale_price: z.number().positive().optional(),
      is_active:  z.boolean().optional(),
      description:z.string().optional().nullable(),
      image_url:  z.string().optional().nullable(),
      specs:      z.record(z.string()).optional()
    }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({error:'Validation Error',details:body.error.flatten()});
    
    const {data: existing} = await getSupabase().from('phone_models').select('specifications').eq('id',id).single();
    const existingSpecs = existing?.specifications || {};

    const specifications = {
      ...existingSpecs,
      ...(body.data.specs || {}),
    };
    if (body.data.description !== undefined) specifications.description = body.data.description;
    if (body.data.image_url !== undefined) specifications.image_url = body.data.image_url;

    const updateData: Record<string, any> = {};
    if (body.data.brand !== undefined) updateData.brand = body.data.brand;
    if (body.data.model !== undefined) updateData.model = body.data.model;
    if (body.data.storage !== undefined) updateData.storage = body.data.storage;
    if (body.data.color !== undefined) updateData.color = body.data.color;
    if (body.data.sale_price !== undefined) updateData.sale_price = body.data.sale_price;
    if (body.data.is_active !== undefined) updateData.is_active = body.data.is_active;
    updateData.specifications = specifications;

    const {data,error} = await getSupabase().from('phone_models').update(updateData as any).eq('id',id).select().single();
    if (error) return reply.status(404).send({error:'Phone model not found'});
    const modelName = `${(data as any).brand ?? ''} ${(data as any).model ?? ''}`.trim();
    const changedField = Object.keys(body.data).join(', ');
    notify({ kind: 'inventory_updated', modelName, field: changedField, updatedBy: req.user!.id });
    return reply.send({data});
  });

  // ── POST /inventory/models/:id/images — upload phone image ─
  app.post('/models/:id/images', {
    preHandler: [authenticate, requireRole('inventory_manager', 'admin', 'super_admin', 'system_operator')],
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const sb = getSupabase();

    // Get existing model specs
    const { data: existing, error: fetchErr } = await sb.from('phone_models').select('specifications').eq('id', id).single();
    if (fetchErr || !existing) return reply.status(404).send({ error: 'Phone model not found' });

    // Read multipart file
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'No file uploaded' });

    const buf = await data.toBuffer();
    const ext = data.filename.split('.').pop() ?? 'jpg';
    const storagePath = `models/${id}/${Date.now()}.${ext}`;

    const { error: uploadErr } = await sb.storage
      .from('phone-images')
      .upload(storagePath, buf, {
        contentType: data.mimetype,
        upsert: false,
      });
    if (uploadErr) return reply.status(500).send({ error: uploadErr.message });

    // Append path to specifications.images array
    const specs = existing.specifications ?? {};
    const images: string[] = Array.isArray(specs.images) ? specs.images : [];
    images.push(storagePath);
    specs.images = images;

    const { data: updated, error: updateErr } = await sb
      .from('phone_models')
      .update({ specifications: specs })
      .eq('id', id)
      .select()
      .single();
    if (updateErr) return reply.status(500).send({ error: updateErr.message });

    // Return signed URL for immediate display
    const { data: sd } = await sb.storage.from('phone-images').createSignedUrl(storagePath, 3600);

    return reply.status(201).send({
      data: { path: storagePath, signedUrl: sd?.signedUrl },
    });
  });

  // ── DELETE /inventory/models/:id/images/:idx — remove a photo ─
  app.delete('/models/:id/images/:idx', {
    preHandler: [authenticate, requireRole('inventory_manager', 'admin', 'super_admin', 'system_operator')],
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id, idx } = req.params as { id: string; idx: string };
    const imageIndex = parseInt(idx, 10);
    const sb = getSupabase();

    const { data: existing, error: fetchErr } = await sb
      .from('phone_models')
      .select('specifications')
      .eq('id', id)
      .single();

    if (fetchErr || !existing) return reply.status(404).send({ error: 'Phone model not found' });

    const specs = existing.specifications ?? {};
    const images: string[] = Array.isArray(specs.images) ? [...specs.images] : [];

    if (imageIndex < 0 || imageIndex >= images.length) {
      return reply.status(400).send({ error: 'Image index out of range' });
    }

    const pathToDelete = images[imageIndex];
    images.splice(imageIndex, 1);
    specs.images = images;

    // Best-effort storage deletion (skip if it was already a full URL)
    if (pathToDelete && !pathToDelete.startsWith('http')) {
      await sb.storage.from('phone-images').remove([pathToDelete]);
    }

    const { error: updateErr } = await sb
      .from('phone_models')
      .update({ specifications: specs })
      .eq('id', id);

    if (updateErr) return reply.status(500).send({ error: updateErr.message });

    return reply.send({ success: true, removed: pathToDelete });
  });

  // ── DELETE /inventory/models/:id — deactivate phone model ─
  app.delete('/models/:id', { preHandler: [authenticate, requireRole('inventory_manager', 'admin', 'super_admin', 'system_operator')] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const sb = getSupabase();
    // Check if any phones in stock are linked to this model
    const { count } = await sb.from('phones').select('id', { count: 'exact', head: true })
      .eq('model_id', id).eq('status', 'in_stock');
    if ((count ?? 0) > 0) {
      return reply.status(409).send({ error: 'Cannot delete model with units currently in stock. Remove stock first.' });
    }
    const { error } = await sb.from('phone_models').update({ is_active: false }).eq('id', id);
    if (error) return reply.status(404).send({ error: 'Phone model not found' });
    return reply.send({ success: true });
  });
}

