/**
 * Supabase Database type definitions for AIRVOICE.
 * Complete schema covering all tables used across API routes.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          firebase_uid: string;
          phone_number: string;
          role: string;
          is_active: boolean;
          is_verified: boolean;
          preferred_language: string;
          nic_number: string | null;
          two_fa_enabled: boolean;
          otp_attempts: number | null;
          otp_locked_until: string | null;
          fcm_token: string | null;
          fcm_token_updated_at: string | null;
          last_login_at: string | null;
          last_login_ip: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['users']['Row']> & {
          firebase_uid: string;
          phone_number: string;
          role: string;
        };
        Update: Partial<Database['public']['Tables']['users']['Row']>;
      };
      customers: {
        Row: {
          id: string;
          user_id: string | null;
          full_name: string;
          full_name_si: string | null;
          full_name_ta: string | null;
          nic_number: string | null;
          date_of_birth: string | null;
          gender: string | null;
          branch: string;
          service_number: string | null;
          military_id_number: string | null;
          rank: string;
          regiment_id: string | null;
          camp_id: string | null;
          retirement_date: string | null;
          phone_number: string | null;
          email: string | null;
          address: string | null;
          risk_score: number;
          risk_level: string;
          risk_updated_at: string | null;
          is_active: boolean;
          is_blocked: boolean;
          block_reason: string | null;
          has_app_account: boolean;
          app_linked_at: string | null;
          legacy_record_id: string | null;
          legacy_imported_at: string | null;
          created_by: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['customers']['Row']> & {
          full_name: string;
          branch: string;
          rank: string;
        };
        Update: Partial<Database['public']['Tables']['customers']['Row']>;
      };
      camps: {
        Row: {
          id: string;
          name: string;
          name_si: string | null;
          name_ta: string | null;
          branch: string;
          district: string | null;
          province: string | null;
          address: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string | null;
        };
        Insert: Partial<Database['public']['Tables']['camps']['Row']> & {
          name: string;
          branch: string;
        };
        Update: Partial<Database['public']['Tables']['camps']['Row']>;
      };
      districts: {
        Row: {
          id: string;
          name: string;
          name_si: string | null;
          name_ta: string | null;
          province: string;
          created_at: string;
          updated_at: string | null;
        };
        Insert: Partial<Database['public']['Tables']['districts']['Row']> & {
          name: string;
          province: string;
        };
        Update: Partial<Database['public']['Tables']['districts']['Row']>;
      };
      regiments: {
        Row: {
          id: string;
          name: string;
          name_si: string | null;
          name_ta: string | null;
          branch: string;
          camp_id: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['regiments']['Row']> & {
          name: string;
          branch: string;
        };
        Update: Partial<Database['public']['Tables']['regiments']['Row']>;
      };
      camp_officer_assignments: {
        Row: {
          id: string;
          user_id: string;
          camp_id: string;
          assigned_by: string | null;
          is_active: boolean;
          assigned_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['camp_officer_assignments']['Row']> & {
          user_id: string;
          camp_id: string;
        };
        Update: Partial<Database['public']['Tables']['camp_officer_assignments']['Row']>;
      };
      phone_models: {
        Row: {
          id: string;
          brand: string;
          model: string;
          storage: string | null;
          color: string | null;
          base_price: number;
          sale_price: number | null;
          purchase_cost: number | null;
          description: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['phone_models']['Row']> & {
          brand: string;
          model: string;
          base_price: number;
        };
        Update: Partial<Database['public']['Tables']['phone_models']['Row']>;
      };
      phones: {
        Row: {
          id: string;
          model_id: string;
          phone_model_id: string | null;
          imei_1: string;
          imei_2: string | null;
          serial_number: string | null;
          status: string;
          stock_location: string | null;
          notes: string | null;
          purchase_cost: number | null;
          purchase_date: string | null;
          warranty_months: number | null;
          supplier_id: string | null;
          received_by: string | null;
          application_id: string | null;
          customer_id: string | null;
          sold_date: string | null;
          allocated_by: string | null;
          allocated_at: string | null;
          deleted_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['phones']['Row']> & {
          model_id: string;
          imei_1: string;
        };
        Update: Partial<Database['public']['Tables']['phones']['Row']>;
      };
      applications: {
        Row: {
          id: string;
          ref_number: string | null;
          customer_id: string;
          phone_model_id: string;
          phone_id: string | null;
          guarantor_id: string | null;
          sale_price: number;
          down_payment: number;
          financed_amount: number | null;
          monthly_amount: number;
          term_months: number;
          status: string;
          sale_date: string | null;
          plan_end_date: string | null;
          handover_date: string | null;
          handover_by: string | null;
          retirement_date: string | null;
          retirement_flag: string | null;
          requires_special_approval: boolean | null;
          special_approval_granted: boolean | null;
          special_approval_by: string | null;
          special_approval_at: string | null;
          sales_officer_id: string | null;
          camp_id: string | null;
          notes: string | null;
          admin_note: string | null;
          rejection_reason: string | null;
          rejection_stage: string | null;
          rejected_at: string | null;
          rejected_by: string | null;
          submitted_at: string | null;
          submitted_by: string | null;
          sales_reviewed_at: string | null;
          sales_reviewed_by: string | null;
          sales_note: string | null;
          camp_reviewed_at: string | null;
          camp_reviewed_by: string | null;
          camp_note: string | null;
          finance_reviewed_at: string | null;
          finance_reviewed_by: string | null;
          finance_note: string | null;
          admin_approved_at: string | null;
          admin_approved_by: string | null;
          retirement_risk_confirmed: boolean | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: Partial<Database['public']['Tables']['applications']['Row']> & {
          customer_id: string;
          phone_model_id: string;
          sale_price: number;
          term_months: number;
        };
        Update: Partial<Database['public']['Tables']['applications']['Row']>;
      };
      installments: {
        Row: {
          id: string;
          application_id: string;
          customer_id: string | null;
          due_date: string;
          due_year: number | null;
          due_month: number | null;
          month_number: number | null;
          amount: number;
          expected_amount: number | null;
          deducted_amount: number | null;
          arrears_amount: number | null;
          status: string;
          paid_at: string | null;
          deduction_month: string | null;
          not_deducted_reason: string | null;
          not_deducted_notes: string | null;
          deduction_submitted_at: string | null;
          deduction_submitted_by: string | null;
          deduction_batch_id: string | null;
          confirmed_at: string | null;
          confirmed_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['installments']['Row']> & {
          application_id: string;
          due_date: string;
          amount: number;
        };
        Update: Partial<Database['public']['Tables']['installments']['Row']>;
      };
      guarantors: {
        Row: {
          id: string;
          customer_id: string | null;
          full_name: string;
          phone_number: string | null;
          email: string | null;
          nic_number: string | null;
          service_number: string | null;
          branch: string | null;
          rank: string | null;
          camp_id: string | null;
          monthly_salary: number | null;
          total_liability: number | null;
          affordability_ok: boolean | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['guarantors']['Row']> & {
          full_name: string;
        };
        Update: Partial<Database['public']['Tables']['guarantors']['Row']>;
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string | null;
          firebase_uid: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          old_values: Json | null;
          new_values: Json | null;
          ip_address: string | null;
          user_agent: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['audit_logs']['Row']> & {
          action: string;
          entity_type: string;
        };
        Update: Partial<Database['public']['Tables']['audit_logs']['Row']>;
      };
      legacy_import_batches: {
        Row: {
          id: string;
          file_name: string;
          file_path: string;
          file_type: string;
          file_size_bytes: number;
          uploaded_by: string;
          status: string;
          total_rows: number | null;
          imported_rows: number | null;
          duplicate_rows: number | null;
          invalid_rows: number | null;
          column_mapping: Json | null;
          sheet_regiment: string | null;
          sheet_period: string | null;
          pdf_reference_path: string | null;
          pdf_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['legacy_import_batches']['Row']> & {
          file_name: string;
          file_path: string;
          file_type: string;
          file_size_bytes: number;
          uploaded_by: string;
          status: string;
        };
        Update: Partial<Database['public']['Tables']['legacy_import_batches']['Row']>;
      };
      legacy_import_rows: {
        Row: {
          id: string;
          batch_id: string;
          row_number: number;
          raw_data: Json;
          service_number: string | null;
          customer_name: string | null;
          guarantor_service_number: string | null;
          guarantor_name: string | null;
          unit: string | null;
          item_count: number | null;
          monthly_amount: number | null;
          term_months: number | null;
          sale_date: string | null;
          deduction_history: Json;
          total_expected: number | null;
          total_deducted: number | null;
          arrears: number | null;
          missed_months: number | null;
          remaining_months: number | null;
          is_settled: boolean;
          status: string;
          customer_id: string | null;
          duplicate_of_customer_id: string | null;
          duplicate_reason: string | null;
          risk_level: string | null;
          risk_score: number | null;
          validation_errors: Json | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['legacy_import_rows']['Row']> & {
          batch_id: string;
          row_number: number;
          raw_data: Json;
          deduction_history: Json;
          status: string;
        };
        Update: Partial<Database['public']['Tables']['legacy_import_rows']['Row']>;
      };
      legacy_customer_links: {
        Row: {
          id: string;
          customer_id: string;
          legacy_row_id: string;
          linked_by: string;
          confidence: number;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['legacy_customer_links']['Row']> & {
          customer_id: string;
          legacy_row_id: string;
          linked_by: string;
        };
        Update: Partial<Database['public']['Tables']['legacy_customer_links']['Row']>;
      };
      customer_documents: {
        Row: {
          id: string;
          customer_id: string;
          document_type: string;
          storage_path: string;
          original_filename: string;
          mime_type: string;
          file_size_bytes: number;
          verification_status: string;
          verified_by: string | null;
          verified_at: string | null;
          rejection_reason: string | null;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['customer_documents']['Row']> & {
          customer_id: string;
          document_type: string;
          storage_path: string;
          original_filename: string;
          mime_type: string;
          file_size_bytes: number;
        };
        Update: Partial<Database['public']['Tables']['customer_documents']['Row']>;
      };
      deductions: {
        Row: {
          id: string;
          installment_id: string;
          camp_id: string;
          deduction_month: string;
          status: string;
          submitted_by: string | null;
          submitted_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['deductions']['Row']> & {
          installment_id: string;
          camp_id: string;
          deduction_month: string;
          status: string;
        };
        Update: Partial<Database['public']['Tables']['deductions']['Row']>;
      };
      deduction_batches: {
        Row: {
          id: string;
          camp_id: string;
          submission_year: number;
          submission_month: number;
          submitted_by: string;
          records_count: number;
          deducted_count: number | null;
          not_deducted_count: number | null;
          total_expected: number | null;
          total_deducted: number | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['deduction_batches']['Row']> & {
          camp_id: string;
          submission_year: number;
          submission_month: number;
          submitted_by: string;
          records_count: number;
        };
        Update: Partial<Database['public']['Tables']['deduction_batches']['Row']>;
      };
      commissions: {
        Row: {
          id: string;
          application_id: string;
          sales_officer_id: string;
          customer_id: string | null;
          amount: number;
          status: string;
          triggered_by_installment_id: string | null;
          became_payable_at: string | null;
          paid_at: string | null;
          paid_by: string | null;
          payment_reference: string | null;
          notes: string | null;
          released_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['commissions']['Row']> & {
          application_id: string;
          sales_officer_id: string;
          amount: number;
          status: string;
        };
        Update: Partial<Database['public']['Tables']['commissions']['Row']>;
      };
      expenses: {
        Row: {
          id: string;
          category: string;
          amount: number;
          description: string | null;
          receipt_path: string | null;
          recorded_by: string;
          expense_date: string;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['expenses']['Row']> & {
          category: string;
          amount: number;
          recorded_by: string;
          expense_date: string;
        };
        Update: Partial<Database['public']['Tables']['expenses']['Row']>;
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          body: string;
          type: string;
          is_read: boolean;
          read_at: string | null;
          data: Json | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['notifications']['Row']> & {
          user_id: string;
          title: string;
          body: string;
          type: string;
        };
        Update: Partial<Database['public']['Tables']['notifications']['Row']>;
      };
      recovery_logs: {
        Row: {
          id: string;
          application_id: string;
          customer_id: string;
          officer_id: string;
          contact_method: string;
          contacted_at: string;
          outcome: string;
          notes: string | null;
          promise_to_pay_date: string | null;
          promise_amount: number | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['recovery_logs']['Row']> & {
          application_id: string;
          customer_id: string;
          officer_id: string;
          contact_method: string;
          contacted_at: string;
          outcome: string;
        };
        Update: Partial<Database['public']['Tables']['recovery_logs']['Row']>;
      };
      stock_orders: {
        Row: {
          id: string;
          model_id: string;
          supplier_id: string | null;
          quantity: number;
          unit_price: number | null;
          status: string;
          requested_by: string;
          notes: string | null;
          created_at: string;
          updated_at: string | null;
        };
        Insert: Partial<Database['public']['Tables']['stock_orders']['Row']> & {
          model_id: string;
          quantity: number;
          requested_by: string;
          status: string;
        };
        Update: Partial<Database['public']['Tables']['stock_orders']['Row']>;
      };
      suppliers: {
        Row: {
          id: string;
          name: string;
          contact_person: string | null;
          phone: string | null;
          email: string | null;
          address: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['suppliers']['Row']> & {
          name: string;
        };
        Update: Partial<Database['public']['Tables']['suppliers']['Row']>;
      };
    };
    Views: {
      application_pipeline: {
        Row: Record<string, Json>;
      };
      monthly_deduction_summary: {
        Row: Record<string, Json>;
      };
    };
    Functions: {
      calculate_risk_score: {
        Args: { p_customer_id: string };
        Returns: number | null;
      };
    };
    Enums: Record<string, never>;
  };
}
