import 'dotenv/config';

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { initFirebase } from './config/firebase';
import { initSupabase } from './config/supabase';

import authRoutes from './routes/auth';
import customerRoutes from './routes/customers';
import applicationRoutes from './routes/applications';
import guarantorRoutes from './routes/guarantors';
import campRoutes from './routes/camps';
import deductionRoutes from './routes/deductions';
import installmentRoutes from './routes/installments';
import phoneRoutes from './routes/phones';
import inventoryRoutes from './routes/inventory';
import commissionRoutes from './routes/commissions';
import expenseRoutes from './routes/expenses';
import recoveryRoutes from './routes/recovery';
import reportRoutes from './routes/reports';
import notificationRoutes from './routes/notifications';
import adminRoutes from './routes/admin';
import legacyImportRoutes from './routes/legacy-import';
import userRoutes from './routes/users';
import documentRoutes from './routes/documents';
import chequeRoutes from './routes/cheque';
import payrollRoutes from './routes/payroll';
import salesRoutes from './routes/sales';
import dashboardRoutes from './routes/dashboard';
import financeRoutes from './routes/finance';
import translationRoutes from './routes/translation';
import districtRoutes from './routes/districts';
import tasksRoutes from './routes/tasks';
import pettyCashRoutes from './routes/petty-cash';
import companyPaymentsRoutes from './routes/company-payments';
import scheduleRoutes from './routes/schedule';
import hrRoutes from './routes/hr';
import chatRoutes from './routes/chat';

export async function buildApp() {


  initFirebase();
  initSupabase();


  const app = Fastify({
    logger: true,
    trustProxy: true
  });



  // Security

  await app.register(helmet, {
    contentSecurityPolicy: false
  });


  const configuredOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const vercelOrigin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;
  const allowedOrigins = vercelOrigin ? [...configuredOrigins, vercelOrigin] : configuredOrigins;

  await app.register(cors, {
    origin: allowedOrigins,
    credentials: true
  });



  await app.register(rateLimit, {
    global: true,
    max: 200,
    timeWindow: "1 minute"
  });



  await app.register(multipart, {
    limits: {
      fileSize:
        20 * 1024 * 1024
    }
  });



  // Swagger

  if (process.env.NODE_ENV !== "production") {


    await app.register(swagger, {

      openapi: {
        info: {
          title: "AIRVOICE Defence Finance API",
          version: "1.0.0",
          description:
            "Production Finance API"
        }
      }

    });



    await app.register(swaggerUi, {
      routePrefix: "/docs"
    });

  }




  // Health

  app.get("/health", async () => {

    return {

      status: "ok",

      timestamp:
        new Date().toISOString()

    };

  });





  // Routes


  await app.register(authRoutes, {
    prefix: "/auth"
  });


  await app.register(userRoutes, {
    prefix: "/users"
  });


  await app.register(customerRoutes, {
    prefix: "/customers"
  });


  await app.register(documentRoutes, {
    prefix: "/customers"
  });


  await app.register(applicationRoutes, {
    prefix: "/applications"
  });


  await app.register(guarantorRoutes, {
    prefix: "/guarantors"
  });


  await app.register(campRoutes, {
    prefix: "/camps"
  });


  await app.register(deductionRoutes, {
    prefix: "/deductions"
  });


  await app.register(installmentRoutes, {
    prefix: "/installments"
  });


  await app.register(phoneRoutes, {
    prefix: "/phones"
  });


  await app.register(inventoryRoutes, {
    prefix: "/inventory"
  });


  await app.register(commissionRoutes, {
    prefix: "/commissions"
  });


  await app.register(expenseRoutes, {
    prefix: "/expenses"
  });


  await app.register(recoveryRoutes, {
    prefix: "/recovery"
  });


  await app.register(reportRoutes, {
    prefix: "/reports"
  });


  await app.register(notificationRoutes, {
    prefix: "/notifications"
  });


  await app.register(adminRoutes, {
    prefix: "/admin"
  });


  await app.register(legacyImportRoutes, {
    prefix: "/legacy-import"
  });


  await app.register(chequeRoutes, {
    prefix: "/cheque"
  });


  await app.register(payrollRoutes, {
    prefix: "/payroll"
  });


  await app.register(financeRoutes, {
    prefix: "/finance"
  });


  await app.register(salesRoutes, {
    prefix: "/sales"
  });


  await app.register(districtRoutes, {
    prefix: "/districts"
  });


  await app.register(dashboardRoutes, {
    prefix: "/dashboard"
  });


  await app.register(translationRoutes, {
    prefix: "/translate"
  });


  await app.register(tasksRoutes, {
    prefix: "/tasks"
  });


  await app.register(pettyCashRoutes, {
    prefix: "/petty-cash"
  });


  await  app.register(companyPaymentsRoutes, { prefix: '/company-payments' });
  app.register(scheduleRoutes, { prefix: '/schedule' });
  app.register(hrRoutes, { prefix: '/hr' });
  app.register(chatRoutes, { prefix: '/chat' });

  const donationsRoutes = require('./routes/donations').default;
  await app.register(donationsRoutes, {
    prefix: "/donations"
  });





  // Error handler


  app.setErrorHandler(
    (error: unknown, request, reply) => {
      app.log.error(error);

      const err = error instanceof Error ? error : new Error(String(error));
      const statusCode = (error as any)?.statusCode ?? 500;
      const isProd = process.env.NODE_ENV === 'production';
      
      // Mask 5xx error details in production to avoid leaking internals
      const message = isProd && statusCode >= 500
        ? 'An error occurred processing your request. Please try again later.'
        : err.message;
      
      reply.status(statusCode)
        .send({
          error: isProd && statusCode >= 500 ? 'ServerError' : err.name,
          message
        });
    }
  );



  return app;

}