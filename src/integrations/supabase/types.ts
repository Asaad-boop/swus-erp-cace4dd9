export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      abandoned_carts: {
        Row: {
          brand_id: string | null
          cart_items: Json
          converted_order_id: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          id: string
          is_converted: boolean
          last_step: string | null
          session_id: string | null
          shipping_address: string | null
          shipping_city: string | null
          shipping_district: string | null
          shipping_thana: string | null
          subtotal: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          brand_id?: string | null
          cart_items?: Json
          converted_order_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          is_converted?: boolean
          last_step?: string | null
          session_id?: string | null
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_district?: string | null
          shipping_thana?: string | null
          subtotal?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          brand_id?: string | null
          cart_items?: Json
          converted_order_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          is_converted?: boolean
          last_step?: string | null
          session_id?: string | null
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_district?: string | null
          shipping_thana?: string | null
          subtotal?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "abandoned_carts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      active_sessions: {
        Row: {
          country: string | null
          first_seen_at: string
          last_seen_at: string
          path: string | null
          referrer: string | null
          session_id: string
          user_agent: string | null
        }
        Insert: {
          country?: string | null
          first_seen_at?: string
          last_seen_at?: string
          path?: string | null
          referrer?: string | null
          session_id: string
          user_agent?: string | null
        }
        Update: {
          country?: string | null
          first_seen_at?: string
          last_seen_at?: string
          path?: string | null
          referrer?: string | null
          session_id?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      activity_log: {
        Row: {
          action: string
          details: Json | null
          entity_id: string
          entity_type: string
          id: string
          ip_address: string | null
          performed_at: string | null
          performed_by: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          details?: Json | null
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: string | null
          performed_at?: string | null
          performed_by?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          details?: Json | null
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: string | null
          performed_at?: string | null
          performed_by?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      activity_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          new_value: Json | null
          note: string | null
          old_value: Json | null
          order_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_value?: Json | null
          note?: string | null
          old_value?: Json | null
          order_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_value?: Json | null
          note?: string | null
          old_value?: Json | null
          order_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      addresses: {
        Row: {
          address_line: string
          city: string
          created_at: string
          district: string
          full_name: string
          id: string
          is_default: boolean
          label: string | null
          phone: string
          postal_code: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address_line: string
          city: string
          created_at?: string
          district: string
          full_name: string
          id?: string
          is_default?: boolean
          label?: string | null
          phone: string
          postal_code?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address_line?: string
          city?: string
          created_at?: string
          district?: string
          full_name?: string
          id?: string
          is_default?: boolean
          label?: string | null
          phone?: string
          postal_code?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          created_at: string
          currency: string | null
          device_type: string | null
          event_name: string
          fb_browser_pixel: string | null
          fb_click_id: string | null
          id: string
          order_id: string | null
          page_type: string | null
          params: Json
          path: string | null
          product_id: string | null
          product_name: string | null
          quantity: number | null
          referrer: string | null
          session_id: string
          user_agent: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          value: number | null
        }
        Insert: {
          created_at?: string
          currency?: string | null
          device_type?: string | null
          event_name: string
          fb_browser_pixel?: string | null
          fb_click_id?: string | null
          id?: string
          order_id?: string | null
          page_type?: string | null
          params?: Json
          path?: string | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number | null
          referrer?: string | null
          session_id: string
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          value?: number | null
        }
        Update: {
          created_at?: string
          currency?: string | null
          device_type?: string | null
          event_name?: string
          fb_browser_pixel?: string | null
          fb_click_id?: string | null
          id?: string
          order_id?: string | null
          page_type?: string | null
          params?: Json
          path?: string | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number | null
          referrer?: string | null
          session_id?: string
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          value?: number | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Relationships: []
      }
      bd_areas: {
        Row: {
          created_at: string | null
          delivery_charge_pathao: number | null
          delivery_charge_redx: number | null
          delivery_charge_steadfast: number | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name_bn: string | null
          name_en: string
          pathao_area_id: string | null
          pathao_zone_id: string | null
          postal_code: string | null
          zone_id: string
        }
        Insert: {
          created_at?: string | null
          delivery_charge_pathao?: number | null
          delivery_charge_redx?: number | null
          delivery_charge_steadfast?: number | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name_bn?: string | null
          name_en: string
          pathao_area_id?: string | null
          pathao_zone_id?: string | null
          postal_code?: string | null
          zone_id: string
        }
        Update: {
          created_at?: string | null
          delivery_charge_pathao?: number | null
          delivery_charge_redx?: number | null
          delivery_charge_steadfast?: number | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name_bn?: string | null
          name_en?: string
          pathao_area_id?: string | null
          pathao_zone_id?: string | null
          postal_code?: string | null
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bd_areas_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "bd_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      bd_cities: {
        Row: {
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name_bn: string | null
          name_en: string
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name_bn?: string | null
          name_en: string
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name_bn?: string | null
          name_en?: string
        }
        Relationships: []
      }
      bd_zones: {
        Row: {
          city_id: string
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name_bn: string | null
          name_en: string
        }
        Insert: {
          city_id: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name_bn?: string | null
          name_en: string
        }
        Update: {
          city_id?: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name_bn?: string | null
          name_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "bd_zones_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "bd_cities"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          settings: Json
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          settings?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          settings?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          brand_id: string | null
          created_at: string
          description: string | null
          display_order: number
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_usage: {
        Row: {
          coupon_id: string
          created_at: string
          discount_amount: number
          id: string
          order_id: string
          user_id: string
        }
        Insert: {
          coupon_id: string
          created_at?: string
          discount_amount?: number
          id?: string
          order_id: string
          user_id: string
        }
        Update: {
          coupon_id?: string
          created_at?: string
          discount_amount?: number
          id?: string
          order_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_usage_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usage_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usage_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_ar_outstanding"
            referencedColumns: ["order_id"]
          },
        ]
      }
      coupons: {
        Row: {
          applicable_categories: Json | null
          applicable_products: Json | null
          brand_id: string | null
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          max_discount: number | null
          min_order_amount: number
          type: Database["public"]["Enums"]["coupon_type"]
          updated_at: string
          usage_limit: number | null
          used_count: number
          valid_from: string
          valid_until: string | null
          value: number
        }
        Insert: {
          applicable_categories?: Json | null
          applicable_products?: Json | null
          brand_id?: string | null
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_discount?: number | null
          min_order_amount?: number
          type?: Database["public"]["Enums"]["coupon_type"]
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
          valid_from?: string
          valid_until?: string | null
          value: number
        }
        Update: {
          applicable_categories?: Json | null
          applicable_products?: Json | null
          brand_id?: string | null
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_discount?: number | null
          min_order_amount?: number
          type?: Database["public"]["Enums"]["coupon_type"]
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
          valid_from?: string
          valid_until?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_credentials: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          provider: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          provider: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          provider?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      courier_history_cache: {
        Row: {
          data: Json
          fetched_at: string
          phone: string
        }
        Insert: {
          data: Json
          fetched_at?: string
          phone: string
        }
        Update: {
          data?: Json
          fetched_at?: string
          phone?: string
        }
        Relationships: []
      }
      courier_shipments: {
        Row: {
          brand_id: string | null
          consignment_id: string | null
          created_at: string
          created_by: string | null
          delivery_fee: number | null
          id: string
          merchant_order_id: string | null
          order_id: string
          provider: string
          request_payload: Json
          response_payload: Json
          status: string | null
          tracking_code: string | null
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          consignment_id?: string | null
          created_at?: string
          created_by?: string | null
          delivery_fee?: number | null
          id?: string
          merchant_order_id?: string | null
          order_id: string
          provider: string
          request_payload?: Json
          response_payload?: Json
          status?: string | null
          tracking_code?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          consignment_id?: string | null
          created_at?: string
          created_by?: string | null
          delivery_fee?: number | null
          id?: string
          merchant_order_id?: string | null
          order_id?: string
          provider?: string
          request_payload?: Json
          response_payload?: Json
          status?: string | null
          tracking_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_shipments_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_accounts: {
        Row: {
          account_number: string | null
          account_type: string
          brand_id: string
          created_at: string
          current_balance: number
          id: string
          is_active: boolean
          name: string
          notes: string | null
          opening_balance: number
          updated_at: string
          wallet_type: string
        }
        Insert: {
          account_number?: string | null
          account_type: string
          brand_id: string
          created_at?: string
          current_balance?: number
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          opening_balance?: number
          updated_at?: string
          wallet_type?: string
        }
        Update: {
          account_number?: string | null
          account_type?: string
          brand_id?: string
          created_at?: string
          current_balance?: number
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          opening_balance?: number
          updated_at?: string
          wallet_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_accounts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_ar_payments: {
        Row: {
          amount: number
          ar_account_id: string | null
          brand_id: string
          cash_account_id: string
          created_at: string
          created_by: string | null
          id: string
          journal_entry_id: string | null
          notes: string | null
          order_id: string
          payment_date: string
          reference_no: string | null
        }
        Insert: {
          amount: number
          ar_account_id?: string | null
          brand_id: string
          cash_account_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          order_id: string
          payment_date?: string
          reference_no?: string | null
        }
        Update: {
          amount?: number
          ar_account_id?: string | null
          brand_id?: string
          cash_account_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          order_id?: string
          payment_date?: string
          reference_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_ar_payments_ar_account_id_fkey"
            columns: ["ar_account_id"]
            isOneToOne: false
            referencedRelation: "erp_chart_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ar_payments_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "erp_chart_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ar_payments_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "erp_journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ar_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ar_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_ar_outstanding"
            referencedColumns: ["order_id"]
          },
        ]
      }
      erp_bill_payments: {
        Row: {
          amount: number
          bill_id: string
          brand_id: string
          cash_account_id: string
          created_at: string
          created_by: string | null
          id: string
          journal_entry_id: string | null
          notes: string | null
          payment_date: string
          reference_no: string | null
        }
        Insert: {
          amount: number
          bill_id: string
          brand_id: string
          cash_account_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          payment_date?: string
          reference_no?: string | null
        }
        Update: {
          amount?: number
          bill_id?: string
          brand_id?: string
          cash_account_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          payment_date?: string
          reference_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_bill_payments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "erp_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_bill_payments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "v_ap_outstanding"
            referencedColumns: ["bill_id"]
          },
          {
            foreignKeyName: "erp_bill_payments_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "erp_chart_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_bill_payments_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "erp_journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_bills: {
        Row: {
          amount: number
          ap_account_id: string | null
          bill_date: string
          bill_no: string
          brand_id: string
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          expense_account_id: string | null
          id: string
          journal_entry_id: string | null
          paid_amount: number
          source_id: string | null
          source_type: string | null
          status: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          ap_account_id?: string | null
          bill_date?: string
          bill_no: string
          brand_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          expense_account_id?: string | null
          id?: string
          journal_entry_id?: string | null
          paid_amount?: number
          source_id?: string | null
          source_type?: string | null
          status?: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          ap_account_id?: string | null
          bill_date?: string
          bill_no?: string
          brand_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          expense_account_id?: string | null
          id?: string
          journal_entry_id?: string | null
          paid_amount?: number
          source_id?: string | null
          source_type?: string | null
          status?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_bills_ap_account_id_fkey"
            columns: ["ap_account_id"]
            isOneToOne: false
            referencedRelation: "erp_chart_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_bills_expense_account_id_fkey"
            columns: ["expense_account_id"]
            isOneToOne: false
            referencedRelation: "erp_chart_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_bills_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "erp_journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_bills_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "erp_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_budgets: {
        Row: {
          account_id: string
          amount: number
          brand_id: string
          created_at: string
          created_by: string | null
          id: string
          month: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          amount?: number
          brand_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          month: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount?: number
          brand_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          month?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_budgets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "erp_chart_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_chart_accounts: {
        Row: {
          account_type: string
          brand_id: string
          code: string
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          id: string
          is_active: boolean
          is_archived: boolean
          name: string
          normal_balance: string
          opening_balance: number
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          account_type: string
          brand_id: string
          code: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_archived?: boolean
          name: string
          normal_balance: string
          opening_balance?: number
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: string
          brand_id?: string
          code?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_archived?: boolean
          name?: string
          normal_balance?: string
          opening_balance?: number
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_chart_accounts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_chart_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "erp_chart_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_courier_settings: {
        Row: {
          base_url: string | null
          brand_id: string
          client_id: string | null
          client_secret: string | null
          created_at: string
          id: string
          is_active: boolean
          password: string | null
          provider: string
          store_id: string | null
          updated_at: string
          username: string | null
          wallet_id: string | null
        }
        Insert: {
          base_url?: string | null
          brand_id: string
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          password?: string | null
          provider?: string
          store_id?: string | null
          updated_at?: string
          username?: string | null
          wallet_id?: string | null
        }
        Update: {
          base_url?: string | null
          brand_id?: string
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          password?: string | null
          provider?: string
          store_id?: string | null
          updated_at?: string
          username?: string | null
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_courier_settings_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_courier_settings_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "erp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_exchange_cases: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          exchange_charge_collected: number
          exchange_type: string
          id: string
          note: string | null
          old_item_condition: string
          original_order_id: string
          original_order_item_id: string | null
          original_product_id: string | null
          original_sku: string | null
          original_variant_id: string | null
          product_cost_loss: number
          refund_amount: number
          replacement_delivery_cost: number
          replacement_order_id: string | null
          replacement_product_id: string | null
          replacement_qty: number
          replacement_sku: string | null
          replacement_variant_id: string | null
          resolved_at: string | null
          return_delivery_cost: number
          status: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          exchange_charge_collected?: number
          exchange_type: string
          id?: string
          note?: string | null
          old_item_condition: string
          original_order_id: string
          original_order_item_id?: string | null
          original_product_id?: string | null
          original_sku?: string | null
          original_variant_id?: string | null
          product_cost_loss?: number
          refund_amount?: number
          replacement_delivery_cost?: number
          replacement_order_id?: string | null
          replacement_product_id?: string | null
          replacement_qty?: number
          replacement_sku?: string | null
          replacement_variant_id?: string | null
          resolved_at?: string | null
          return_delivery_cost?: number
          status?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          exchange_charge_collected?: number
          exchange_type?: string
          id?: string
          note?: string | null
          old_item_condition?: string
          original_order_id?: string
          original_order_item_id?: string | null
          original_product_id?: string | null
          original_sku?: string | null
          original_variant_id?: string | null
          product_cost_loss?: number
          refund_amount?: number
          replacement_delivery_cost?: number
          replacement_order_id?: string | null
          replacement_product_id?: string | null
          replacement_qty?: number
          replacement_sku?: string | null
          replacement_variant_id?: string | null
          resolved_at?: string | null
          return_delivery_cost?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_exchange_cases_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_exchange_cases_original_order_id_fkey"
            columns: ["original_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_exchange_cases_original_order_id_fkey"
            columns: ["original_order_id"]
            isOneToOne: false
            referencedRelation: "v_ar_outstanding"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "erp_exchange_cases_original_order_item_id_fkey"
            columns: ["original_order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_exchange_cases_original_product_id_fkey"
            columns: ["original_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_exchange_cases_original_variant_id_fkey"
            columns: ["original_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_exchange_cases_replacement_order_id_fkey"
            columns: ["replacement_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_exchange_cases_replacement_order_id_fkey"
            columns: ["replacement_order_id"]
            isOneToOne: false
            referencedRelation: "v_ar_outstanding"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "erp_exchange_cases_replacement_product_id_fkey"
            columns: ["replacement_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_exchange_cases_replacement_variant_id_fkey"
            columns: ["replacement_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_expense_categories: {
        Row: {
          brand_id: string | null
          created_at: string
          id: string
          is_active: boolean
          kind: string
          name: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          name: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_expense_categories_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_finance_attachments: {
        Row: {
          brand_id: string
          created_at: string
          file_name: string | null
          id: string
          journal_entry_id: string | null
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          transaction_id: string | null
          uploaded_by: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          file_name?: string | null
          id?: string
          journal_entry_id?: string | null
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          transaction_id?: string | null
          uploaded_by?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          file_name?: string | null
          id?: string
          journal_entry_id?: string | null
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          transaction_id?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_finance_attachments_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_finance_attachments_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "erp_journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_finance_audit: {
        Row: {
          action: string
          actor_id: string | null
          after_data: Json | null
          before_data: Json | null
          brand_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          brand_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          brand_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      erp_fx_rates: {
        Row: {
          brand_id: string
          created_at: string
          from_ccy: string
          id: string
          rate: number
          rate_date: string
          to_ccy: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          from_ccy: string
          id?: string
          rate: number
          rate_date: string
          to_ccy: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          from_ccy?: string
          id?: string
          rate?: number
          rate_date?: string
          to_ccy?: string
        }
        Relationships: []
      }
      erp_journal_entries: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          entry_date: string
          entry_no: string
          id: string
          is_locked: boolean
          source_id: string | null
          source_type: string | null
          status: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          entry_date: string
          entry_no: string
          id?: string
          is_locked?: boolean
          source_id?: string | null
          source_type?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          entry_date?: string
          entry_no?: string
          id?: string
          is_locked?: boolean
          source_id?: string | null
          source_type?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_journal_entries_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_journal_lines: {
        Row: {
          account_id: string
          brand_id: string
          created_at: string
          credit: number
          debit: number
          description: string | null
          id: string
          journal_entry_id: string
          line_order: number
        }
        Insert: {
          account_id: string
          brand_id: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id: string
          line_order?: number
        }
        Update: {
          account_id?: string
          brand_id?: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id?: string
          line_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "erp_journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "erp_chart_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_journal_lines_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_journal_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "erp_journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_period_locks: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          locked_by: string | null
          locked_until: string
          reason: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          locked_by?: string | null
          locked_until: string
          reason?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          locked_by?: string | null
          locked_until?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_period_locks_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_product_expense_allocations: {
        Row: {
          allocation_date: string | null
          allocation_method: string
          amount: number
          brand_id: string
          campaign_id: string | null
          created_at: string
          created_by: string | null
          expense_transaction_id: string | null
          expense_type: string
          id: string
          journal_entry_id: string | null
          mkt_ad_account_id: string | null
          note: string | null
          product_id: string
          sku: string | null
          source: string
          variant_id: string | null
        }
        Insert: {
          allocation_date?: string | null
          allocation_method?: string
          amount?: number
          brand_id: string
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          expense_transaction_id?: string | null
          expense_type: string
          id?: string
          journal_entry_id?: string | null
          mkt_ad_account_id?: string | null
          note?: string | null
          product_id: string
          sku?: string | null
          source?: string
          variant_id?: string | null
        }
        Update: {
          allocation_date?: string | null
          allocation_method?: string
          amount?: number
          brand_id?: string
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          expense_transaction_id?: string | null
          expense_type?: string
          id?: string
          journal_entry_id?: string | null
          mkt_ad_account_id?: string | null
          note?: string | null
          product_id?: string
          sku?: string | null
          source?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_product_expense_allocations_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_product_expense_allocations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mkt_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_product_expense_allocations_expense_transaction_id_fkey"
            columns: ["expense_transaction_id"]
            isOneToOne: false
            referencedRelation: "erp_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_product_expense_allocations_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "erp_journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_product_expense_allocations_mkt_ad_account_id_fkey"
            columns: ["mkt_ad_account_id"]
            isOneToOne: false
            referencedRelation: "mkt_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_product_expense_allocations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_product_expense_allocations_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_recurring_rules: {
        Row: {
          amount: number
          auto_post: boolean
          brand_id: string
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          frequency: string
          id: string
          interval_n: number
          is_active: boolean
          last_run_at: string | null
          lines: Json
          name: string
          next_run_date: string
          start_date: string
          updated_at: string
        }
        Insert: {
          amount: number
          auto_post?: boolean
          brand_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          frequency: string
          id?: string
          interval_n?: number
          is_active?: boolean
          last_run_at?: string | null
          lines: Json
          name: string
          next_run_date: string
          start_date: string
          updated_at?: string
        }
        Update: {
          amount?: number
          auto_post?: boolean
          brand_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          frequency?: string
          id?: string
          interval_n?: number
          is_active?: boolean
          last_run_at?: string | null
          lines?: Json
          name?: string
          next_run_date?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      erp_recurring_runs: {
        Row: {
          brand_id: string
          created_at: string
          error: string | null
          id: string
          journal_entry_id: string | null
          rule_id: string
          run_date: string
          status: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          error?: string | null
          id?: string
          journal_entry_id?: string | null
          rule_id: string
          run_date: string
          status?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          error?: string | null
          id?: string
          journal_entry_id?: string | null
          rule_id?: string
          run_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_recurring_runs_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "erp_journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_recurring_runs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "erp_recurring_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_return_cases: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          customer_paid_delivery: number
          id: string
          item_condition: string
          note: string | null
          order_id: string
          order_item_id: string | null
          outbound_delivery_cost: number
          packaging_loss: number
          product_cost_loss: number
          product_id: string | null
          qty: number
          refund_amount: number
          resolved_at: string | null
          return_delivery_cost: number
          return_type: string
          sku: string | null
          status: string
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          customer_paid_delivery?: number
          id?: string
          item_condition: string
          note?: string | null
          order_id: string
          order_item_id?: string | null
          outbound_delivery_cost?: number
          packaging_loss?: number
          product_cost_loss?: number
          product_id?: string | null
          qty?: number
          refund_amount?: number
          resolved_at?: string | null
          return_delivery_cost?: number
          return_type: string
          sku?: string | null
          status?: string
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          customer_paid_delivery?: number
          id?: string
          item_condition?: string
          note?: string | null
          order_id?: string
          order_item_id?: string | null
          outbound_delivery_cost?: number
          packaging_loss?: number
          product_cost_loss?: number
          product_id?: string | null
          qty?: number
          refund_amount?: number
          resolved_at?: string | null
          return_delivery_cost?: number
          return_type?: string
          sku?: string | null
          status?: string
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_return_cases_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_return_cases_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_return_cases_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_ar_outstanding"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "erp_return_cases_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_return_cases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_return_cases_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_settings: {
        Row: {
          brand_id: string
          config: Json
          created_at: string
          default_courier: string | null
          id: string
          invoice_footer: string | null
          invoice_pad: number
          invoice_prefix: string | null
          invoice_seq: number
          updated_at: string
        }
        Insert: {
          brand_id: string
          config?: Json
          created_at?: string
          default_courier?: string | null
          id?: string
          invoice_footer?: string | null
          invoice_pad?: number
          invoice_prefix?: string | null
          invoice_seq?: number
          updated_at?: string
        }
        Update: {
          brand_id?: string
          config?: Json
          created_at?: string
          default_courier?: string | null
          id?: string
          invoice_footer?: string | null
          invoice_pad?: number
          invoice_prefix?: string | null
          invoice_seq?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_settings_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_statement_imports: {
        Row: {
          account_id: string
          brand_id: string
          created_by: string | null
          id: string
          imported_at: string
          matched_lines: number
          period_end: string | null
          period_start: string | null
          source: string
          total_lines: number
        }
        Insert: {
          account_id: string
          brand_id: string
          created_by?: string | null
          id?: string
          imported_at?: string
          matched_lines?: number
          period_end?: string | null
          period_start?: string | null
          source: string
          total_lines?: number
        }
        Update: {
          account_id?: string
          brand_id?: string
          created_by?: string | null
          id?: string
          imported_at?: string
          matched_lines?: number
          period_end?: string | null
          period_start?: string | null
          source?: string
          total_lines?: number
        }
        Relationships: [
          {
            foreignKeyName: "erp_statement_imports_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "erp_chart_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_statement_lines: {
        Row: {
          account_id: string
          brand_id: string
          created_at: string
          credit: number
          debit: number
          description: string | null
          id: string
          import_id: string
          matched_at: string | null
          matched_by: string | null
          matched_line_id: string | null
          reference_no: string | null
          txn_date: string
        }
        Insert: {
          account_id: string
          brand_id: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          import_id: string
          matched_at?: string | null
          matched_by?: string | null
          matched_line_id?: string | null
          reference_no?: string | null
          txn_date: string
        }
        Update: {
          account_id?: string
          brand_id?: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          import_id?: string
          matched_at?: string | null
          matched_by?: string | null
          matched_line_id?: string | null
          reference_no?: string | null
          txn_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_statement_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "erp_chart_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_statement_lines_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "erp_statement_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_statement_lines_matched_line_id_fkey"
            columns: ["matched_line_id"]
            isOneToOne: false
            referencedRelation: "erp_journal_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_supplier_payments: {
        Row: {
          account_id: string | null
          amount: number
          brand_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          payment_date: string
          reference_no: string | null
          supplier_id: string
          transaction_id: string | null
        }
        Insert: {
          account_id?: string | null
          amount: number
          brand_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          reference_no?: string | null
          supplier_id: string
          transaction_id?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number
          brand_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          reference_no?: string | null
          supplier_id?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_supplier_payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "erp_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_supplier_payments_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "erp_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_supplier_payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "erp_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_suppliers: {
        Row: {
          address: string | null
          brand_id: string
          contact_person: string | null
          country: string
          created_at: string
          credit_limit_bdt: number
          currency: string
          current_due: number
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          opening_balance: number
          payment_terms_days: number
          phone: string | null
          source_link: string | null
          supplier_type: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          brand_id: string
          contact_person?: string | null
          country?: string
          created_at?: string
          credit_limit_bdt?: number
          currency?: string
          current_due?: number
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          opening_balance?: number
          payment_terms_days?: number
          phone?: string | null
          source_link?: string | null
          supplier_type?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          brand_id?: string
          contact_person?: string | null
          country?: string
          created_at?: string
          credit_limit_bdt?: number
          currency?: string
          current_due?: number
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          opening_balance?: number
          payment_terms_days?: number
          phone?: string | null
          source_link?: string | null
          supplier_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_suppliers_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_tax_entries: {
        Row: {
          brand_id: string
          created_at: string
          direction: string
          entry_date: string
          id: string
          journal_entry_id: string | null
          note: string | null
          tax_amount: number
          tax_rate_id: string
          taxable_amount: number
        }
        Insert: {
          brand_id: string
          created_at?: string
          direction: string
          entry_date: string
          id?: string
          journal_entry_id?: string | null
          note?: string | null
          tax_amount: number
          tax_rate_id: string
          taxable_amount: number
        }
        Update: {
          brand_id?: string
          created_at?: string
          direction?: string
          entry_date?: string
          id?: string
          journal_entry_id?: string | null
          note?: string | null
          tax_amount?: number
          tax_rate_id?: string
          taxable_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "erp_tax_entries_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "erp_journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_tax_entries_tax_rate_id_fkey"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "erp_tax_rates"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_tax_rates: {
        Row: {
          brand_id: string
          code: string
          created_at: string
          id: string
          input_account_id: string | null
          is_active: boolean
          kind: string
          name: string
          output_account_id: string | null
          rate: number
          updated_at: string
        }
        Insert: {
          brand_id: string
          code: string
          created_at?: string
          id?: string
          input_account_id?: string | null
          is_active?: boolean
          kind: string
          name: string
          output_account_id?: string | null
          rate: number
          updated_at?: string
        }
        Update: {
          brand_id?: string
          code?: string
          created_at?: string
          id?: string
          input_account_id?: string | null
          is_active?: boolean
          kind?: string
          name?: string
          output_account_id?: string | null
          rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_tax_rates_input_account_id_fkey"
            columns: ["input_account_id"]
            isOneToOne: false
            referencedRelation: "erp_chart_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_tax_rates_output_account_id_fkey"
            columns: ["output_account_id"]
            isOneToOne: false
            referencedRelation: "erp_chart_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_transactions: {
        Row: {
          account_id: string | null
          amount: number
          attachment_url: string | null
          brand_id: string
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          reference_id: string | null
          reference_type: string | null
          supplier_id: string | null
          to_account_id: string | null
          transaction_date: string
          txn_type: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          attachment_url?: string | null
          brand_id: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          supplier_id?: string | null
          to_account_id?: string | null
          transaction_date?: string
          txn_type: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          attachment_url?: string | null
          brand_id?: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          supplier_id?: string | null
          to_account_id?: string | null
          transaction_date?: string
          txn_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "erp_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_transactions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "erp_expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_transactions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "erp_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_transactions_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "erp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      homepage_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          sections: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          sections: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          sections?: Json
        }
        Relationships: []
      }
      imp_cargo_agent_ledger: {
        Row: {
          agent_id: string
          amount_bdt: number
          brand_id: string | null
          carton_id: string | null
          created_at: string
          created_by: string | null
          direction: Database["public"]["Enums"]["imp_agent_ledger_dir"]
          entry_date: string
          entry_type: Database["public"]["Enums"]["imp_agent_ledger_kind"]
          id: string
          note: string | null
          po_id: string | null
          reference: string | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          amount_bdt: number
          brand_id?: string | null
          carton_id?: string | null
          created_at?: string
          created_by?: string | null
          direction: Database["public"]["Enums"]["imp_agent_ledger_dir"]
          entry_date?: string
          entry_type?: Database["public"]["Enums"]["imp_agent_ledger_kind"]
          id?: string
          note?: string | null
          po_id?: string | null
          reference?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          amount_bdt?: number
          brand_id?: string | null
          carton_id?: string | null
          created_at?: string
          created_by?: string | null
          direction?: Database["public"]["Enums"]["imp_agent_ledger_dir"]
          entry_date?: string
          entry_type?: Database["public"]["Enums"]["imp_agent_ledger_kind"]
          id?: string
          note?: string | null
          po_id?: string | null
          reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "imp_cargo_agent_ledger_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "imp_cargo_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_cargo_agent_ledger_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_cargo_agent_ledger_carton_id_fkey"
            columns: ["carton_id"]
            isOneToOne: false
            referencedRelation: "imp_cartons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_cargo_agent_ledger_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "imp_purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_cargo_agent_rates: {
        Row: {
          agent_id: string
          created_at: string
          created_by: string | null
          currency: string
          fx_rate: number
          id: string
          note: string | null
          rate_date: string
          shipping_rate_per_kg_bdt: number
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          fx_rate: number
          id?: string
          note?: string | null
          rate_date?: string
          shipping_rate_per_kg_bdt: number
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          fx_rate?: number
          id?: string
          note?: string | null
          rate_date?: string
          shipping_rate_per_kg_bdt?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "imp_cargo_agent_rates_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "imp_cargo_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_cargo_agents: {
        Row: {
          address: string | null
          brand_id: string
          created_at: string
          created_by: string | null
          default_currency: string
          default_fx_rate: number
          default_shipping_rate_per_kg_bdt: number
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          brand_id: string
          created_at?: string
          created_by?: string | null
          default_currency?: string
          default_fx_rate?: number
          default_shipping_rate_per_kg_bdt?: number
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          brand_id?: string
          created_at?: string
          created_by?: string | null
          default_currency?: string
          default_fx_rate?: number
          default_shipping_rate_per_kg_bdt?: number
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imp_cargo_agents_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_carton_items: {
        Row: {
          carton_id: string
          created_at: string
          id: string
          po_item_id: string
          product_id: string | null
          quantity_damaged: number
          quantity_expected: number
          quantity_missing: number
          quantity_ok: number
          sku_snapshot: string | null
          supplier_cost_portion_bdt: number
          variant_id: string | null
        }
        Insert: {
          carton_id: string
          created_at?: string
          id?: string
          po_item_id: string
          product_id?: string | null
          quantity_damaged?: number
          quantity_expected: number
          quantity_missing?: number
          quantity_ok?: number
          sku_snapshot?: string | null
          supplier_cost_portion_bdt?: number
          variant_id?: string | null
        }
        Update: {
          carton_id?: string
          created_at?: string
          id?: string
          po_item_id?: string
          product_id?: string | null
          quantity_damaged?: number
          quantity_expected?: number
          quantity_missing?: number
          quantity_ok?: number
          sku_snapshot?: string | null
          supplier_cost_portion_bdt?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imp_carton_items_carton_id_fkey"
            columns: ["carton_id"]
            isOneToOne: false
            referencedRelation: "imp_cartons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_carton_items_po_item_id_fkey"
            columns: ["po_item_id"]
            isOneToOne: false
            referencedRelation: "imp_po_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_carton_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_carton_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_cartons: {
        Row: {
          barcode: string
          carton_number: number
          created_at: string
          expected_quantity: number
          id: string
          local_courier_bdt: number
          notes: string | null
          po_id: string
          posted_at: string | null
          qc_at: string | null
          received_at: string | null
          release_request_note: string | null
          release_requested_at: string | null
          release_requested_by: string | null
          released_at: string | null
          shipping_charge_bdt: number
          status: Database["public"]["Enums"]["imp_carton_status"]
          supplier_cost_bdt: number
          total_landed_bdt: number
          updated_at: string
          warehouse_id: string | null
          weight_kg: number | null
        }
        Insert: {
          barcode: string
          carton_number: number
          created_at?: string
          expected_quantity?: number
          id?: string
          local_courier_bdt?: number
          notes?: string | null
          po_id: string
          posted_at?: string | null
          qc_at?: string | null
          received_at?: string | null
          release_request_note?: string | null
          release_requested_at?: string | null
          release_requested_by?: string | null
          released_at?: string | null
          shipping_charge_bdt?: number
          status?: Database["public"]["Enums"]["imp_carton_status"]
          supplier_cost_bdt?: number
          total_landed_bdt?: number
          updated_at?: string
          warehouse_id?: string | null
          weight_kg?: number | null
        }
        Update: {
          barcode?: string
          carton_number?: number
          created_at?: string
          expected_quantity?: number
          id?: string
          local_courier_bdt?: number
          notes?: string | null
          po_id?: string
          posted_at?: string | null
          qc_at?: string | null
          received_at?: string | null
          release_request_note?: string | null
          release_requested_at?: string | null
          release_requested_by?: string | null
          released_at?: string | null
          shipping_charge_bdt?: number
          status?: Database["public"]["Enums"]["imp_carton_status"]
          supplier_cost_bdt?: number
          total_landed_bdt?: number
          updated_at?: string
          warehouse_id?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "imp_cartons_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "imp_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_cartons_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_payments: {
        Row: {
          amount_bdt: number
          brand_id: string
          carton_id: string | null
          created_at: string
          created_by: string | null
          id: string
          idempotency_key: string
          is_reversed: boolean
          journal_entry_id: string | null
          notes: string | null
          payment_date: string
          payment_type: Database["public"]["Enums"]["imp_payment_type"]
          po_id: string
          reference: string | null
          reversed_at: string | null
          reverses_id: string | null
          wallet_id: string
        }
        Insert: {
          amount_bdt: number
          brand_id: string
          carton_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key: string
          is_reversed?: boolean
          journal_entry_id?: string | null
          notes?: string | null
          payment_date?: string
          payment_type: Database["public"]["Enums"]["imp_payment_type"]
          po_id: string
          reference?: string | null
          reversed_at?: string | null
          reverses_id?: string | null
          wallet_id: string
        }
        Update: {
          amount_bdt?: number
          brand_id?: string
          carton_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string
          is_reversed?: boolean
          journal_entry_id?: string | null
          notes?: string | null
          payment_date?: string
          payment_type?: Database["public"]["Enums"]["imp_payment_type"]
          po_id?: string
          reference?: string | null
          reversed_at?: string | null
          reverses_id?: string | null
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "imp_payments_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_payments_carton_id_fkey"
            columns: ["carton_id"]
            isOneToOne: false
            referencedRelation: "imp_cartons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_payments_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "erp_journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_payments_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "imp_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_payments_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: false
            referencedRelation: "imp_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_payments_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "erp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_po_items: {
        Row: {
          created_at: string
          id: string
          image_snapshot: string | null
          name_snapshot: string
          po_id: string
          product_id: string | null
          quantity: number
          sku_snapshot: string | null
          subtotal_bdt: number
          unit_cost_bdt: number
          unit_cost_foreign: number
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          image_snapshot?: string | null
          name_snapshot: string
          po_id: string
          product_id?: string | null
          quantity: number
          sku_snapshot?: string | null
          subtotal_bdt?: number
          unit_cost_bdt?: number
          unit_cost_foreign?: number
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          image_snapshot?: string | null
          name_snapshot?: string
          po_id?: string
          product_id?: string | null
          quantity?: number
          sku_snapshot?: string | null
          subtotal_bdt?: number
          unit_cost_bdt?: number
          unit_cost_foreign?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imp_po_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "imp_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_po_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_po_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_po_sequences: {
        Row: {
          brand_id: string
          last_number: number
          updated_at: string
        }
        Insert: {
          brand_id: string
          last_number?: number
          updated_at?: string
        }
        Update: {
          brand_id?: string
          last_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "imp_po_sequences_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_purchase_orders: {
        Row: {
          brand_id: string
          cargo_agent_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          due_bdt: number
          fx_rate: number
          grand_total_bdt: number
          id: string
          local_courier_total_bdt: number
          notes: string | null
          order_date: string
          paid_bdt: number
          po_number: string
          product_subtotal_bdt: number
          shipping_total_bdt: number
          status: Database["public"]["Enums"]["imp_po_status"]
          submitted_by_agent_id: string | null
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          cargo_agent_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          due_bdt?: number
          fx_rate?: number
          grand_total_bdt?: number
          id?: string
          local_courier_total_bdt?: number
          notes?: string | null
          order_date?: string
          paid_bdt?: number
          po_number: string
          product_subtotal_bdt?: number
          shipping_total_bdt?: number
          status?: Database["public"]["Enums"]["imp_po_status"]
          submitted_by_agent_id?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          cargo_agent_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          due_bdt?: number
          fx_rate?: number
          grand_total_bdt?: number
          id?: string
          local_courier_total_bdt?: number
          notes?: string | null
          order_date?: string
          paid_bdt?: number
          po_number?: string
          product_subtotal_bdt?: number
          shipping_total_bdt?: number
          status?: Database["public"]["Enums"]["imp_po_status"]
          submitted_by_agent_id?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "imp_purchase_orders_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_purchase_orders_cargo_agent_id_fkey"
            columns: ["cargo_agent_id"]
            isOneToOne: false
            referencedRelation: "imp_cargo_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_purchase_orders_submitted_by_agent_id_fkey"
            columns: ["submitted_by_agent_id"]
            isOneToOne: false
            referencedRelation: "imp_cargo_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "erp_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_status_history: {
        Row: {
          action: string | null
          after_data: Json | null
          before_data: Json | null
          brand_id: string
          changed_by: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          new_status: string | null
          notes: string | null
          previous_status: string | null
        }
        Insert: {
          action?: string | null
          after_data?: Json | null
          before_data?: Json | null
          brand_id: string
          changed_by?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          new_status?: string | null
          notes?: string | null
          previous_status?: string | null
        }
        Update: {
          action?: string | null
          after_data?: Json | null
          before_data?: Json | null
          brand_id?: string
          changed_by?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          new_status?: string | null
          notes?: string | null
          previous_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imp_status_history_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      low_stock_alerts: {
        Row: {
          brand_id: string | null
          created_at: string
          current_stock: number
          id: string
          is_resolved: boolean
          product_id: string
          resolved_at: string | null
          threshold: number
          variant_id: string | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          current_stock: number
          id?: string
          is_resolved?: boolean
          product_id: string
          resolved_at?: string | null
          threshold: number
          variant_id?: string | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          current_stock?: number
          id?: string
          is_resolved?: boolean
          product_id?: string
          resolved_at?: string | null
          threshold?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "low_stock_alerts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_ad_accounts: {
        Row: {
          access_token: string | null
          app_id: string | null
          app_secret: string | null
          auto_post_to_finance: boolean
          brand_id: string
          business_id: string | null
          created_at: string
          currency: string | null
          external_id: string
          finance_wallet_id: string | null
          id: string
          last_error: string | null
          last_insights_sync_at: string | null
          last_structure_sync_at: string | null
          name: string
          status: Database["public"]["Enums"]["mkt_account_status"]
          timezone: string | null
          updated_at: string
          usd_to_bdt_rate: number
        }
        Insert: {
          access_token?: string | null
          app_id?: string | null
          app_secret?: string | null
          auto_post_to_finance?: boolean
          brand_id: string
          business_id?: string | null
          created_at?: string
          currency?: string | null
          external_id: string
          finance_wallet_id?: string | null
          id?: string
          last_error?: string | null
          last_insights_sync_at?: string | null
          last_structure_sync_at?: string | null
          name: string
          status?: Database["public"]["Enums"]["mkt_account_status"]
          timezone?: string | null
          updated_at?: string
          usd_to_bdt_rate?: number
        }
        Update: {
          access_token?: string | null
          app_id?: string | null
          app_secret?: string | null
          auto_post_to_finance?: boolean
          brand_id?: string
          business_id?: string | null
          created_at?: string
          currency?: string | null
          external_id?: string
          finance_wallet_id?: string | null
          id?: string
          last_error?: string | null
          last_insights_sync_at?: string | null
          last_structure_sync_at?: string | null
          name?: string
          status?: Database["public"]["Enums"]["mkt_account_status"]
          timezone?: string | null
          updated_at?: string
          usd_to_bdt_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "mkt_ad_accounts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_ad_accounts_finance_wallet_id_fkey"
            columns: ["finance_wallet_id"]
            isOneToOne: false
            referencedRelation: "erp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_ads: {
        Row: {
          account_id: string
          adset_id: string
          brand_id: string
          campaign_id: string
          created_at: string
          creative_body: string | null
          creative_thumbnail: string | null
          effective_status: string | null
          external_id: string
          id: string
          name: string
          raw: Json | null
          status: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          adset_id: string
          brand_id: string
          campaign_id: string
          created_at?: string
          creative_body?: string | null
          creative_thumbnail?: string | null
          effective_status?: string | null
          external_id: string
          id?: string
          name: string
          raw?: Json | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          adset_id?: string
          brand_id?: string
          campaign_id?: string
          created_at?: string
          creative_body?: string | null
          creative_thumbnail?: string | null
          effective_status?: string | null
          external_id?: string
          id?: string
          name?: string
          raw?: Json | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_ads_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "mkt_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_ads_adset_id_fkey"
            columns: ["adset_id"]
            isOneToOne: false
            referencedRelation: "mkt_adsets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_ads_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_ads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mkt_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_adsets: {
        Row: {
          account_id: string
          brand_id: string
          campaign_id: string
          created_at: string
          daily_budget: number | null
          effective_status: string | null
          external_id: string
          id: string
          lifetime_budget: number | null
          name: string
          raw: Json | null
          status: string | null
          targeting_summary: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          brand_id: string
          campaign_id: string
          created_at?: string
          daily_budget?: number | null
          effective_status?: string | null
          external_id: string
          id?: string
          lifetime_budget?: number | null
          name: string
          raw?: Json | null
          status?: string | null
          targeting_summary?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          brand_id?: string
          campaign_id?: string
          created_at?: string
          daily_budget?: number | null
          effective_status?: string | null
          external_id?: string
          id?: string
          lifetime_budget?: number | null
          name?: string
          raw?: Json | null
          status?: string | null
          targeting_summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_adsets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "mkt_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_adsets_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_adsets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mkt_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_campaign_products: {
        Row: {
          brand_id: string
          campaign_id: string
          created_at: string
          id: string
          note: string | null
          product_id: string
          updated_at: string
          weight: number
        }
        Insert: {
          brand_id: string
          campaign_id: string
          created_at?: string
          id?: string
          note?: string | null
          product_id: string
          updated_at?: string
          weight?: number
        }
        Update: {
          brand_id?: string
          campaign_id?: string
          created_at?: string
          id?: string
          note?: string | null
          product_id?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "mkt_campaign_products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_campaign_products_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mkt_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_campaign_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_campaigns: {
        Row: {
          account_id: string
          brand_id: string
          created_at: string
          daily_budget: number | null
          effective_status: string | null
          external_id: string
          id: string
          lifetime_budget: number | null
          name: string
          objective: string | null
          raw: Json | null
          start_time: string | null
          status: string | null
          stop_time: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          brand_id: string
          created_at?: string
          daily_budget?: number | null
          effective_status?: string | null
          external_id: string
          id?: string
          lifetime_budget?: number | null
          name: string
          objective?: string | null
          raw?: Json | null
          start_time?: string | null
          status?: string | null
          stop_time?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          brand_id?: string
          created_at?: string
          daily_budget?: number | null
          effective_status?: string | null
          external_id?: string
          id?: string
          lifetime_budget?: number | null
          name?: string
          objective?: string | null
          raw?: Json | null
          start_time?: string | null
          status?: string | null
          stop_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_campaigns_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "mkt_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_campaigns_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_insights_daily: {
        Row: {
          account_id: string
          ad_id: string | null
          adset_id: string | null
          brand_id: string
          campaign_id: string | null
          clicks: number
          cpc: number | null
          cpm: number | null
          created_at: string
          ctr: number | null
          date: string
          id: string
          impressions: number
          meta_add_to_cart: number
          meta_initiate_checkout: number
          meta_leads: number
          meta_purchase_value: number
          meta_purchases: number
          raw: Json | null
          reach: number
          spend: number
          updated_at: string
        }
        Insert: {
          account_id: string
          ad_id?: string | null
          adset_id?: string | null
          brand_id: string
          campaign_id?: string | null
          clicks?: number
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          date: string
          id?: string
          impressions?: number
          meta_add_to_cart?: number
          meta_initiate_checkout?: number
          meta_leads?: number
          meta_purchase_value?: number
          meta_purchases?: number
          raw?: Json | null
          reach?: number
          spend?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          ad_id?: string | null
          adset_id?: string | null
          brand_id?: string
          campaign_id?: string | null
          clicks?: number
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          date?: string
          id?: string
          impressions?: number
          meta_add_to_cart?: number
          meta_initiate_checkout?: number
          meta_leads?: number
          meta_purchase_value?: number
          meta_purchases?: number
          raw?: Json | null
          reach?: number
          spend?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_insights_daily_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "mkt_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_insights_daily_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "mkt_ads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_insights_daily_adset_id_fkey"
            columns: ["adset_id"]
            isOneToOne: false
            referencedRelation: "mkt_adsets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_insights_daily_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_insights_daily_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mkt_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_manual_expenses: {
        Row: {
          account_id: string | null
          amount: number
          attachment_url: string | null
          brand_id: string
          campaign_id: string | null
          category: Database["public"]["Enums"]["mkt_expense_category"]
          created_at: string
          created_by: string | null
          currency: string
          date: string
          id: string
          mkt_ad_account_id: string | null
          note: string | null
          product_id: string | null
          source: string
          transaction_id: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          account_id?: string | null
          amount: number
          attachment_url?: string | null
          brand_id: string
          campaign_id?: string | null
          category?: Database["public"]["Enums"]["mkt_expense_category"]
          created_at?: string
          created_by?: string | null
          currency?: string
          date?: string
          id?: string
          mkt_ad_account_id?: string | null
          note?: string | null
          product_id?: string | null
          source?: string
          transaction_id?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number
          attachment_url?: string | null
          brand_id?: string
          campaign_id?: string | null
          category?: Database["public"]["Enums"]["mkt_expense_category"]
          created_at?: string
          created_by?: string | null
          currency?: string
          date?: string
          id?: string
          mkt_ad_account_id?: string | null
          note?: string | null
          product_id?: string | null
          source?: string
          transaction_id?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_manual_expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "erp_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_manual_expenses_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_manual_expenses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mkt_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_manual_expenses_mkt_ad_account_id_fkey"
            columns: ["mkt_ad_account_id"]
            isOneToOne: false
            referencedRelation: "mkt_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_manual_expenses_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_manual_expenses_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "erp_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_order_attributions: {
        Row: {
          ad_id: string | null
          adset_id: string | null
          brand_id: string
          campaign_id: string | null
          confidence: number
          created_at: string
          fbclid: string | null
          id: string
          note: string | null
          order_id: string
          source: Database["public"]["Enums"]["mkt_attribution_source"]
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          ad_id?: string | null
          adset_id?: string | null
          brand_id: string
          campaign_id?: string | null
          confidence?: number
          created_at?: string
          fbclid?: string | null
          id?: string
          note?: string | null
          order_id: string
          source: Database["public"]["Enums"]["mkt_attribution_source"]
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          ad_id?: string | null
          adset_id?: string | null
          brand_id?: string
          campaign_id?: string | null
          confidence?: number
          created_at?: string
          fbclid?: string | null
          id?: string
          note?: string | null
          order_id?: string
          source?: Database["public"]["Enums"]["mkt_attribution_source"]
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_order_attributions_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "mkt_ads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_order_attributions_adset_id_fkey"
            columns: ["adset_id"]
            isOneToOne: false
            referencedRelation: "mkt_adsets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_order_attributions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_order_attributions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mkt_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_order_attributions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_order_attributions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "v_ar_outstanding"
            referencedColumns: ["order_id"]
          },
        ]
      }
      mkt_sync_log: {
        Row: {
          account_id: string | null
          brand_id: string | null
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          kind: Database["public"]["Enums"]["mkt_sync_kind"]
          meta: Json | null
          rows_processed: number
          started_at: string
          status: Database["public"]["Enums"]["mkt_sync_status"]
        }
        Insert: {
          account_id?: string | null
          brand_id?: string | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["mkt_sync_kind"]
          meta?: Json | null
          rows_processed?: number
          started_at?: string
          status?: Database["public"]["Enums"]["mkt_sync_status"]
        }
        Update: {
          account_id?: string | null
          brand_id?: string | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["mkt_sync_kind"]
          meta?: Json | null
          rows_processed?: number
          started_at?: string
          status?: Database["public"]["Enums"]["mkt_sync_status"]
        }
        Relationships: [
          {
            foreignKeyName: "mkt_sync_log_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "mkt_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_sync_log_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_tracking_events: {
        Row: {
          brand_id: string | null
          created_at: string
          event_type: string
          fbclid: string | null
          id: string
          ip_hash: string | null
          order_id: string | null
          phone: string | null
          product_id: string | null
          raw: Json | null
          referrer: string | null
          session_id: string | null
          url: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          visitor_id: string | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          event_type: string
          fbclid?: string | null
          id?: string
          ip_hash?: string | null
          order_id?: string | null
          phone?: string | null
          product_id?: string | null
          raw?: Json | null
          referrer?: string | null
          session_id?: string | null
          url?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          event_type?: string
          fbclid?: string | null
          id?: string
          ip_hash?: string | null
          order_id?: string | null
          phone?: string | null
          product_id?: string | null
          raw?: Json | null
          referrer?: string | null
          session_id?: string | null
          url?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_tracking_events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_tracking_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_tracking_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_ar_outstanding"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "mkt_tracking_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          cost_price: number | null
          courier_cost_allocated: number
          created_at: string
          delivery_charge_allocated: number
          discount_amount: number
          discount_type: Database["public"]["Enums"]["discount_type"] | null
          id: string
          image: string | null
          line_discount_allocated: number
          line_total: number | null
          name: string
          order_id: string
          packaging_cost_allocated: number
          price: number
          product_id: string
          quantity: number
          refund_amount_allocated: number
          source_type: string | null
          status_snapshot: string | null
          tax_amount: number
          unit_cost_snapshot: number | null
          unit_price: number | null
          user_id: string | null
          variant_id: string | null
          variant_label: string | null
        }
        Insert: {
          cost_price?: number | null
          courier_cost_allocated?: number
          created_at?: string
          delivery_charge_allocated?: number
          discount_amount?: number
          discount_type?: Database["public"]["Enums"]["discount_type"] | null
          id?: string
          image?: string | null
          line_discount_allocated?: number
          line_total?: number | null
          name: string
          order_id: string
          packaging_cost_allocated?: number
          price: number
          product_id: string
          quantity?: number
          refund_amount_allocated?: number
          source_type?: string | null
          status_snapshot?: string | null
          tax_amount?: number
          unit_cost_snapshot?: number | null
          unit_price?: number | null
          user_id?: string | null
          variant_id?: string | null
          variant_label?: string | null
        }
        Update: {
          cost_price?: number | null
          courier_cost_allocated?: number
          created_at?: string
          delivery_charge_allocated?: number
          discount_amount?: number
          discount_type?: Database["public"]["Enums"]["discount_type"] | null
          id?: string
          image?: string | null
          line_discount_allocated?: number
          line_total?: number | null
          name?: string
          order_id?: string
          packaging_cost_allocated?: number
          price?: number
          product_id?: string
          quantity?: number
          refund_amount_allocated?: number
          source_type?: string | null
          status_snapshot?: string | null
          tax_amount?: number
          unit_cost_snapshot?: number | null
          unit_price?: number | null
          user_id?: string | null
          variant_id?: string | null
          variant_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_ar_outstanding"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_locks: {
        Row: {
          acquired_at: string
          last_heartbeat_at: string
          order_id: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          acquired_at?: string
          last_heartbeat_at?: string
          order_id: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          acquired_at?: string
          last_heartbeat_at?: string
          order_id?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      order_notes: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          is_internal: boolean
          order_id: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_internal?: boolean
          order_id: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_internal?: boolean
          order_id?: string
        }
        Relationships: []
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          from_status: string | null
          id: string
          metadata: Json | null
          note: string | null
          order_id: string
          reason: string | null
          to_status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          metadata?: Json | null
          note?: string | null
          order_id: string
          reason?: string | null
          to_status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          metadata?: Json | null
          note?: string | null
          order_id?: string
          reason?: string | null
          to_status?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          actual_shipping_breakdown: Json | null
          actual_shipping_cost: number | null
          actual_shipping_recorded_at: string | null
          actual_shipping_source: string | null
          admin_notes: string | null
          advance_amount: number
          advance_payment_number: string | null
          advance_source: string | null
          advance_txn_id: string | null
          alternate_phone: string | null
          assigned_to: string | null
          auto_call_enabled: boolean | null
          brand_id: string | null
          call_attempt_count: number
          call_status: Database["public"]["Enums"]["call_status"]
          cancel_reason: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          confirmation_status: Database["public"]["Enums"]["confirmation_status"]
          confirmed_at: string | null
          confirmed_by: string | null
          coupon_code: string | null
          courier_assigned_at: string | null
          courier_name: string | null
          created_at: string
          customer_ip: string | null
          customer_note: string | null
          delivered_at: string | null
          delivery_area_id: string | null
          delivery_city_id: string | null
          delivery_method: string | null
          delivery_zone_id: string | null
          device_info: Json | null
          discount_amount: number
          duplicate_flag: boolean
          expected_delivery_date: string | null
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          hold_reason: string | null
          hold_until: string | null
          id: string
          in_transit_at: string | null
          internal_note: string | null
          invoice_no: string | null
          is_cross_sale: boolean
          is_guest_order: boolean
          is_preorder: boolean
          last_call_at: string | null
          last_called_by: string | null
          latest_note: string | null
          notes: string | null
          order_tags: string[]
          packaged_at: string | null
          packaged_by: string | null
          paid_at: string | null
          partial_amount: number | null
          pathao_area_id: number | null
          pathao_area_name: string | null
          pathao_city_id: number | null
          pathao_city_name: string | null
          pathao_zone_id: number | null
          pathao_zone_name: string | null
          payment_method: string | null
          payment_source: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          pipeline_log: Json
          priority: Database["public"]["Enums"]["order_priority"]
          refund_amount: number
          rejection_reason: string | null
          return_note: string | null
          return_type: string | null
          risk_flag: boolean
          scheduled_date: string | null
          shipped_at: string | null
          shipped_by: string | null
          shipping_address: string | null
          shipping_city: string | null
          shipping_district: string | null
          shipping_fee: number
          shipping_name: string | null
          shipping_note: string | null
          shipping_phone: string | null
          shipping_thana: string | null
          source: Database["public"]["Enums"]["order_source"] | null
          source_platform: string | null
          source_website: string | null
          status: Database["public"]["Enums"]["order_status"]
          status_log: Json
          subtotal: number
          tags: string[] | null
          total: number
          tracking_number: string | null
          transaction_id: string | null
          updated_at: string
          user_id: string | null
          verified_at: string | null
          web_status: Database["public"]["Enums"]["web_order_status"] | null
        }
        Insert: {
          actual_shipping_breakdown?: Json | null
          actual_shipping_cost?: number | null
          actual_shipping_recorded_at?: string | null
          actual_shipping_source?: string | null
          admin_notes?: string | null
          advance_amount?: number
          advance_payment_number?: string | null
          advance_source?: string | null
          advance_txn_id?: string | null
          alternate_phone?: string | null
          assigned_to?: string | null
          auto_call_enabled?: boolean | null
          brand_id?: string | null
          call_attempt_count?: number
          call_status?: Database["public"]["Enums"]["call_status"]
          cancel_reason?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmation_status?: Database["public"]["Enums"]["confirmation_status"]
          confirmed_at?: string | null
          confirmed_by?: string | null
          coupon_code?: string | null
          courier_assigned_at?: string | null
          courier_name?: string | null
          created_at?: string
          customer_ip?: string | null
          customer_note?: string | null
          delivered_at?: string | null
          delivery_area_id?: string | null
          delivery_city_id?: string | null
          delivery_method?: string | null
          delivery_zone_id?: string | null
          device_info?: Json | null
          discount_amount?: number
          duplicate_flag?: boolean
          expected_delivery_date?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          hold_reason?: string | null
          hold_until?: string | null
          id?: string
          in_transit_at?: string | null
          internal_note?: string | null
          invoice_no?: string | null
          is_cross_sale?: boolean
          is_guest_order?: boolean
          is_preorder?: boolean
          last_call_at?: string | null
          last_called_by?: string | null
          latest_note?: string | null
          notes?: string | null
          order_tags?: string[]
          packaged_at?: string | null
          packaged_by?: string | null
          paid_at?: string | null
          partial_amount?: number | null
          pathao_area_id?: number | null
          pathao_area_name?: string | null
          pathao_city_id?: number | null
          pathao_city_name?: string | null
          pathao_zone_id?: number | null
          pathao_zone_name?: string | null
          payment_method?: string | null
          payment_source?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pipeline_log?: Json
          priority?: Database["public"]["Enums"]["order_priority"]
          refund_amount?: number
          rejection_reason?: string | null
          return_note?: string | null
          return_type?: string | null
          risk_flag?: boolean
          scheduled_date?: string | null
          shipped_at?: string | null
          shipped_by?: string | null
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_district?: string | null
          shipping_fee?: number
          shipping_name?: string | null
          shipping_note?: string | null
          shipping_phone?: string | null
          shipping_thana?: string | null
          source?: Database["public"]["Enums"]["order_source"] | null
          source_platform?: string | null
          source_website?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          status_log?: Json
          subtotal?: number
          tags?: string[] | null
          total?: number
          tracking_number?: string | null
          transaction_id?: string | null
          updated_at?: string
          user_id?: string | null
          verified_at?: string | null
          web_status?: Database["public"]["Enums"]["web_order_status"] | null
        }
        Update: {
          actual_shipping_breakdown?: Json | null
          actual_shipping_cost?: number | null
          actual_shipping_recorded_at?: string | null
          actual_shipping_source?: string | null
          admin_notes?: string | null
          advance_amount?: number
          advance_payment_number?: string | null
          advance_source?: string | null
          advance_txn_id?: string | null
          alternate_phone?: string | null
          assigned_to?: string | null
          auto_call_enabled?: boolean | null
          brand_id?: string | null
          call_attempt_count?: number
          call_status?: Database["public"]["Enums"]["call_status"]
          cancel_reason?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmation_status?: Database["public"]["Enums"]["confirmation_status"]
          confirmed_at?: string | null
          confirmed_by?: string | null
          coupon_code?: string | null
          courier_assigned_at?: string | null
          courier_name?: string | null
          created_at?: string
          customer_ip?: string | null
          customer_note?: string | null
          delivered_at?: string | null
          delivery_area_id?: string | null
          delivery_city_id?: string | null
          delivery_method?: string | null
          delivery_zone_id?: string | null
          device_info?: Json | null
          discount_amount?: number
          duplicate_flag?: boolean
          expected_delivery_date?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          hold_reason?: string | null
          hold_until?: string | null
          id?: string
          in_transit_at?: string | null
          internal_note?: string | null
          invoice_no?: string | null
          is_cross_sale?: boolean
          is_guest_order?: boolean
          is_preorder?: boolean
          last_call_at?: string | null
          last_called_by?: string | null
          latest_note?: string | null
          notes?: string | null
          order_tags?: string[]
          packaged_at?: string | null
          packaged_by?: string | null
          paid_at?: string | null
          partial_amount?: number | null
          pathao_area_id?: number | null
          pathao_area_name?: string | null
          pathao_city_id?: number | null
          pathao_city_name?: string | null
          pathao_zone_id?: number | null
          pathao_zone_name?: string | null
          payment_method?: string | null
          payment_source?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pipeline_log?: Json
          priority?: Database["public"]["Enums"]["order_priority"]
          refund_amount?: number
          rejection_reason?: string | null
          return_note?: string | null
          return_type?: string | null
          risk_flag?: boolean
          scheduled_date?: string | null
          shipped_at?: string | null
          shipped_by?: string | null
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_district?: string | null
          shipping_fee?: number
          shipping_name?: string | null
          shipping_note?: string | null
          shipping_phone?: string | null
          shipping_thana?: string | null
          source?: Database["public"]["Enums"]["order_source"] | null
          source_platform?: string | null
          source_website?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          status_log?: Json
          subtotal?: number
          tags?: string[] | null
          total?: number
          tracking_number?: string | null
          transaction_id?: string | null
          updated_at?: string
          user_id?: string | null
          verified_at?: string | null
          web_status?: Database["public"]["Enums"]["web_order_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_area_id_fkey"
            columns: ["delivery_area_id"]
            isOneToOne: false
            referencedRelation: "bd_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_city_id_fkey"
            columns: ["delivery_city_id"]
            isOneToOne: false
            referencedRelation: "bd_cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_zone_id_fkey"
            columns: ["delivery_zone_id"]
            isOneToOne: false
            referencedRelation: "bd_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      page_views: {
        Row: {
          country: string | null
          created_at: string
          device_type: string | null
          id: string
          page_type: string | null
          path: string
          product_id: string | null
          referrer: string | null
          session_id: string
          user_id: string | null
          utm_source: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          page_type?: string | null
          path: string
          product_id?: string | null
          referrer?: string | null
          session_id: string
          user_id?: string | null
          utm_source?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          page_type?: string | null
          path?: string
          product_id?: string | null
          referrer?: string | null
          session_id?: string
          user_id?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      product_option_types: {
        Row: {
          created_at: string
          display_order: number
          id: string
          name: string
          product_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          name: string
          product_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_option_types_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_option_values: {
        Row: {
          created_at: string
          display_order: number
          id: string
          option_type_id: string
          swatch_hex: string | null
          value: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          option_type_id: string
          swatch_hex?: string | null
          value: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          option_type_id?: string
          swatch_hex?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_option_values_option_type_id_fkey"
            columns: ["option_type_id"]
            isOneToOne: false
            referencedRelation: "product_option_types"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variant_values: {
        Row: {
          option_value_id: string
          variant_id: string
        }
        Insert: {
          option_value_id: string
          variant_id: string
        }
        Update: {
          option_value_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variant_values_option_value_id_fkey"
            columns: ["option_value_id"]
            isOneToOne: false
            referencedRelation: "product_option_values"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variant_values_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          created_at: string
          display_order: number
          id: string
          image: string | null
          is_active: boolean
          price_override: number | null
          product_id: string
          sku: string | null
          stock: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          image?: string | null
          is_active?: boolean
          price_override?: number | null
          product_id: string
          sku?: string | null
          stock?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          image?: string | null
          is_active?: boolean
          price_override?: number | null
          product_id?: string
          sku?: string | null
          stock?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          benefits: Json
          brand_id: string | null
          category_id: string | null
          cost_price: number
          created_at: string
          description: string
          display_order: number
          gallery: Json
          id: string
          image: string
          is_active: boolean
          is_featured: boolean
          is_new_arrival: boolean
          low_stock_threshold: number
          old_price: number | null
          price: number
          rating: number
          reorder_point: number | null
          reviews: number
          shipping_fee_inside: number | null
          shipping_fee_outside: number | null
          sku: string | null
          slug: string
          specs: Json
          stock: number
          title: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          benefits?: Json
          brand_id?: string | null
          category_id?: string | null
          cost_price?: number
          created_at?: string
          description?: string
          display_order?: number
          gallery?: Json
          id?: string
          image: string
          is_active?: boolean
          is_featured?: boolean
          is_new_arrival?: boolean
          low_stock_threshold?: number
          old_price?: number | null
          price: number
          rating?: number
          reorder_point?: number | null
          reviews?: number
          shipping_fee_inside?: number | null
          shipping_fee_outside?: number | null
          sku?: string | null
          slug: string
          specs?: Json
          stock?: number
          title: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          benefits?: Json
          brand_id?: string | null
          category_id?: string | null
          cost_price?: number
          created_at?: string
          description?: string
          display_order?: number
          gallery?: Json
          id?: string
          image?: string
          is_active?: boolean
          is_featured?: boolean
          is_new_arrival?: boolean
          low_stock_threshold?: number
          old_price?: number | null
          price?: number
          rating?: number
          reorder_point?: number | null
          reviews?: number
          shipping_fee_inside?: number | null
          shipping_fee_outside?: number | null
          sku?: string | null
          slug?: string
          specs?: Json
          stock?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          admin_notes: string | null
          cancellation_count: number
          created_at: string
          customer_segment: string | null
          display_name: string | null
          fake_order_count: number
          flag_reason: string | null
          id: string
          is_flagged: boolean
          total_orders: number | null
          total_spent: number | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          cancellation_count?: number
          created_at?: string
          customer_segment?: string | null
          display_name?: string | null
          fake_order_count?: number
          flag_reason?: string | null
          id: string
          is_flagged?: boolean
          total_orders?: number | null
          total_spent?: number | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          cancellation_count?: number
          created_at?: string
          customer_segment?: string | null
          display_name?: string | null
          fake_order_count?: number
          flag_reason?: string | null
          id?: string
          is_flagged?: boolean
          total_orders?: number | null
          total_spent?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          admin_note: string | null
          comment: string | null
          created_at: string
          guest_name: string | null
          guest_phone: string | null
          id: string
          images: string[]
          is_approved: boolean
          order_id: string | null
          product_id: string
          rating: number
          title: string | null
          updated_at: string
          user_id: string | null
          videos: string[]
        }
        Insert: {
          admin_note?: string | null
          comment?: string | null
          created_at?: string
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          images?: string[]
          is_approved?: boolean
          order_id?: string | null
          product_id: string
          rating: number
          title?: string | null
          updated_at?: string
          user_id?: string | null
          videos?: string[]
        }
        Update: {
          admin_note?: string | null
          comment?: string | null
          created_at?: string
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          images?: string[]
          is_approved?: boolean
          order_id?: string | null
          product_id?: string
          rating?: number
          title?: string | null
          updated_at?: string
          user_id?: string | null
          videos?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_ar_outstanding"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      staff_permissions: {
        Row: {
          permissions: Json
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          permissions?: Json
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          permissions?: Json
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          brand_id: string | null
          created_at: string
          delta: number
          id: string
          idempotency_key: string | null
          note: string | null
          product_id: string
          reason: string
          reference_id: string | null
          reference_type: string | null
          stock_after: number
          stock_before: number
          total_cost_bdt: number | null
          unit_cost_bdt: number | null
          user_id: string
          variant_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          delta: number
          id?: string
          idempotency_key?: string | null
          note?: string | null
          product_id: string
          reason?: string
          reference_id?: string | null
          reference_type?: string | null
          stock_after: number
          stock_before: number
          total_cost_bdt?: number | null
          unit_cost_bdt?: number | null
          user_id: string
          variant_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          delta?: number
          id?: string
          idempotency_key?: string | null
          note?: string | null
          product_id?: string
          reason?: string
          reference_id?: string | null
          reference_type?: string | null
          stock_after?: number
          stock_before?: number
          total_cost_bdt?: number | null
          unit_cost_bdt?: number | null
          user_id?: string
          variant_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      warehouses: {
        Row: {
          address: string | null
          brand_id: string
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          brand_id: string
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          brand_id?: string
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      customer_stats_by_phone: {
        Row: {
          cancelled_orders: number | null
          delivered_orders: number | null
          fake_orders: number | null
          phone: string | null
          success_rate: number | null
          total_orders: number | null
        }
        Relationships: []
      }
      reviews_public: {
        Row: {
          admin_note: string | null
          comment: string | null
          created_at: string | null
          guest_name: string | null
          id: string | null
          images: string[] | null
          is_approved: boolean | null
          order_id: string | null
          product_id: string | null
          rating: number | null
          title: string | null
          updated_at: string | null
          user_id: string | null
          videos: string[] | null
        }
        Insert: {
          admin_note?: string | null
          comment?: string | null
          created_at?: string | null
          guest_name?: string | null
          id?: string | null
          images?: string[] | null
          is_approved?: boolean | null
          order_id?: string | null
          product_id?: string | null
          rating?: number | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
          videos?: string[] | null
        }
        Update: {
          admin_note?: string | null
          comment?: string | null
          created_at?: string | null
          guest_name?: string | null
          id?: string | null
          images?: string[] | null
          is_approved?: boolean | null
          order_id?: string | null
          product_id?: string | null
          rating?: number | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
          videos?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_ar_outstanding"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      v_ap_outstanding: {
        Row: {
          age_days: number | null
          amount: number | null
          bill_date: string | null
          bill_id: string | null
          bill_no: string | null
          brand_id: string | null
          due_date: string | null
          outstanding: number | null
          paid_amount: number | null
          status: string | null
          supplier_id: string | null
          supplier_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_bills_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "erp_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      v_ar_outstanding: {
        Row: {
          age_days: number | null
          brand_id: string | null
          customer_name: string | null
          customer_phone: string | null
          invoice_amount: number | null
          invoice_date: string | null
          order_id: string | null
          order_status: string | null
          outstanding: number | null
          paid: number | null
          payment_method: string | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          prepaid: number | null
        }
        Insert: {
          age_days?: never
          brand_id?: string | null
          customer_name?: never
          customer_phone?: never
          invoice_amount?: number | null
          invoice_date?: never
          order_id?: string | null
          order_status?: never
          outstanding?: never
          paid?: never
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          prepaid?: never
        }
        Update: {
          age_days?: never
          brand_id?: string | null
          customer_name?: never
          customer_phone?: never
          invoice_amount?: number | null
          invoice_date?: never
          order_id?: string | null
          order_status?: never
          outstanding?: never
          paid?: never
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          prepaid?: never
        }
        Relationships: [
          {
            foreignKeyName: "orders_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      v_product_incoming: {
        Row: {
          brand_id: string | null
          incoming: number | null
          product_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imp_po_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_purchase_orders_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _advance_date: {
        Args: { _d: string; _freq: string; _n: number }
        Returns: string
      }
      _imp_has_any_role: {
        Args: { _roles: string[]; _user: string }
        Returns: boolean
      }
      _imp_log: {
        Args: {
          _action: string
          _after?: Json
          _before?: Json
          _brand: string
          _entity_id: string
          _entity_type: string
          _new: string
          _notes: string
          _prev: string
          _user: string
        }
        Returns: undefined
      }
      _imp_post_journal: {
        Args: {
          _brand_id: string
          _description: string
          _entry_date: string
          _lines: Json
          _source_id: string
          _source_type: string
          _user: string
        }
        Returns: string
      }
      _imp_record_payment: {
        Args: {
          _amount: number
          _brand: string
          _carton: string
          _cr_account: string
          _date: string
          _dr_account: string
          _idem: string
          _notes: string
          _po: string
          _ptype: Database["public"]["Enums"]["imp_payment_type"]
          _ref: string
          _user: string
          _wallet: string
        }
        Returns: string
      }
      _imp_refresh_po_status: { Args: { _po: string }; Returns: undefined }
      _imp_refresh_po_totals: { Args: { _po: string }; Returns: undefined }
      _mkt_require_staff: { Args: never; Returns: undefined }
      acquire_order_lock: {
        Args: { _force?: boolean; _order_id: string }
        Returns: {
          o_acquired: boolean
          o_acquired_at: string
          o_last_heartbeat_at: string
          o_order_id: string
          o_user_id: string
          o_user_name: string
        }[]
      }
      add_order_note: {
        Args: { _body: string; _is_internal?: boolean; _order_id: string }
        Returns: string
      }
      adjust_account_balance: {
        Args: { _account_id: string; _delta: number; _reason: string }
        Returns: string
      }
      adjust_product_stock: {
        Args: {
          _delta: number
          _note?: string
          _product_id: string
          _reason: string
        }
        Returns: Json
      }
      admin_rls_audit: {
        Args: never
        Returns: {
          cmd: string
          permissive: string
          policyname: string
          qual: string
          roles: string[]
          rowsecurity: boolean
          tablename: string
          with_check: string
        }[]
      }
      append_order_status_log: {
        Args: { _entry: Json; _log_field: string; _order_id: string }
        Returns: undefined
      }
      backfill_order_profit_snapshots: {
        Args: { p_brand_id: string }
        Returns: number
      }
      create_bill: {
        Args: {
          _amount: number
          _ap_account_id: string
          _bill_date: string
          _bill_no: string
          _brand_id: string
          _description?: string
          _due_date: string
          _expense_account_id: string
          _supplier_id: string
        }
        Returns: string
      }
      create_journal_entry: {
        Args: {
          _brand_id: string
          _description: string
          _entry_date: string
          _lines: Json
          _source_id?: string
          _source_type?: string
          _status?: string
        }
        Returns: string
      }
      current_cargo_agent_id: { Args: never; Returns: string }
      erp_profit_loss: {
        Args: { _brand_id: string; _from: string; _to: string }
        Returns: Json
      }
      finalize_order_on_confirm: {
        Args: { _order_id: string }
        Returns: undefined
      }
      get_actual_roas_daily: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: {
          actual_roas: number
          attributed_orders: number
          collected: number
          day: string
          delivered_orders: number
          meta_roas: number
          net_profit: number
          poas: number
          revenue: number
          spend: number
        }[]
      }
      get_ad_report: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: {
          actual_roas: number
          ad_id: string
          ad_name: string
          attributed_orders: number
          campaign_name: string
          clicks: number
          delivered_orders: number
          external_ad_id: string
          impressions: number
          net_profit: number
          poas: number
          revenue: number
          spend: number
          thumbnail_url: string
        }[]
      }
      get_adset_report: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: {
          actual_roas: number
          adset_id: string
          adset_name: string
          attributed_orders: number
          campaign_name: string
          clicks: number
          delivered_orders: number
          external_adset_id: string
          impressions: number
          net_profit: number
          poas: number
          revenue: number
          spend: number
        }[]
      }
      get_balance_sheet: {
        Args: { _as_of: string; _brand_id: string }
        Returns: Json
      }
      get_brand_profitability_rollup: {
        Args: {
          p_brand_id: string
          p_date_basis?: string
          p_date_from?: string
          p_date_to?: string
        }
        Returns: {
          cogs: number
          confirmed_qty: number
          courier_cost: number
          current_stock: number
          delivered_qty: number
          exchange_loss: number
          gross_profit: number
          image: string
          marketing_content: number
          meta_ads: number
          name: string
          net_profit: number
          product_id: string
          profit_per_unit: number
          return_loss: number
          returned_qty: number
          revenue: number
          roi_percent: number
          sku: string
        }[]
      }
      get_campaign_report: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: {
          actual_roas: number
          attributed_orders: number
          campaign_id: string
          campaign_name: string
          clicks: number
          collected: number
          delivered_orders: number
          delivery_rate: number
          external_campaign_id: string
          health: string
          impressions: number
          meta_purchases: number
          meta_roas: number
          meta_value: number
          net_profit: number
          poas: number
          product_cost: number
          return_rate: number
          returned_orders: number
          revenue: number
          spend: number
          status: string
        }[]
      }
      get_cargo_agent_balance: { Args: { _agent_id: string }; Returns: number }
      get_courier_campaign_report: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: {
          attributed_orders: number
          campaign_id: string
          campaign_name: string
          courier_cost: number
          delivered_orders: number
          delivery_rate: number
          provider: string
          return_rate: number
          returned_orders: number
        }[]
      }
      get_customer_stats: { Args: { p_user_id: string }; Returns: Json }
      get_finance_dashboard: {
        Args: { _brand_id: string; _from: string; _to: string }
        Returns: Json
      }
      get_fx_rate: {
        Args: { p_brand: string; p_date: string; p_from: string; p_to: string }
        Returns: number
      }
      get_general_ledger: {
        Args: {
          _account_id: string
          _brand_id: string
          _from: string
          _to: string
        }
        Returns: {
          credit: number
          debit: number
          description: string
          entry_date: string
          entry_no: string
          running_balance: number
        }[]
      }
      get_marketing_overview: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: Json
      }
      get_order_courier_cost: { Args: { _order_id: string }; Returns: number }
      get_pl_v2: {
        Args: { _brand_id: string; _from: string; _to: string }
        Returns: Json
      }
      get_product_campaign_report: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: {
          attributed_orders: number
          campaign_id: string
          campaign_name: string
          delivered_orders: number
          product_cost: number
          product_id: string
          product_name: string
          revenue: number
          units_sold: number
        }[]
      }
      get_product_profitability_report: {
        Args: {
          p_brand_id: string
          p_couriers?: string[]
          p_date_basis?: string
          p_date_from?: string
          p_date_to?: string
          p_product_id: string
          p_sources?: string[]
          p_variant_id?: string
        }
        Returns: Json
      }
      get_trial_balance: {
        Args: { _as_of: string; _brand_id: string }
        Returns: {
          account_id: string
          account_type: string
          balance: number
          code: string
          name: string
          normal_balance: string
          total_credit: number
          total_debit: number
        }[]
      }
      get_vat_summary: {
        Args: { p_brand: string; p_from: string; p_to: string }
        Returns: {
          input_tax: number
          input_taxable: number
          net_payable: number
          output_tax: number
          output_taxable: number
          rate: number
          tax_code: string
          tax_name: string
        }[]
      }
      hard_delete_order: { Args: { _order_id: string }; Returns: undefined }
      has_brand_access: {
        Args: { _brand_id: string; _user_id?: string }
        Returns: boolean
      }
      has_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      heartbeat_order_lock: { Args: { _order_id: string }; Returns: undefined }
      imp_create_po: { Args: { _payload: Json }; Returns: Json }
      imp_get_or_create_account: {
        Args: {
          _brand: string
          _code: string
          _name: string
          _normal: string
          _type: string
        }
        Returns: string
      }
      imp_mark_arrived: { Args: { _payload: Json }; Returns: Json }
      imp_next_po_number: { Args: { _brand: string }; Returns: string }
      imp_post_to_inventory: { Args: { _payload: Json }; Returns: Json }
      imp_quick_create_product: {
        Args: { _brand: string; _image?: string; _sku?: string; _title: string }
        Returns: Json
      }
      imp_record_payment_rpc: { Args: { _payload: Json }; Returns: Json }
      imp_release_carton: { Args: { _payload: Json }; Returns: Json }
      imp_update_carton_stage: {
        Args: { _carton: string; _new_stage: string; _notes?: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_finance_staff: { Args: { _uid: string }; Returns: boolean }
      is_guest_order: { Args: { _order_id: string }; Returns: boolean }
      is_marketing_staff: { Args: { _uid: string }; Returns: boolean }
      is_recent_guest_order: { Args: { _order_id: string }; Returns: boolean }
      log_order_view: { Args: { p_order_id: string }; Returns: undefined }
      mark_abandoned_cart_converted: {
        Args: { _id: string; _order_id: string }
        Returns: undefined
      }
      match_statement_line: {
        Args: { _journal_line_id: string; _line_id: string }
        Returns: undefined
      }
      mkt_attribution_explorer: {
        Args: {
          p_brand_id: string
          p_campaign_id?: string
          p_from: string
          p_limit?: number
          p_source?: string
          p_to: string
        }
        Returns: {
          ad_id: string
          ad_name: string
          adset_id: string
          adset_name: string
          allocated_ad_spend: number
          campaign_id: string
          campaign_name: string
          is_delivered: boolean
          is_returned: boolean
          medium: string
          net_profit: number
          net_sales: number
          order_created_at: string
          order_id: string
          order_status: string
          source: string
        }[]
      }
      mkt_campaign_summary: {
        Args: {
          p_brand_id: string
          p_campaign_id: string
          p_from: string
          p_to: string
        }
        Returns: Json
      }
      mkt_courier_campaign_report: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: {
          campaign_id: string
          campaign_name: string
          courier_provider: string
          delivered_orders: number
          delivery_rate: number
          net_profit: number
          net_revenue: number
          return_rate: number
          returned_orders: number
          total_orders: number
        }[]
      }
      mkt_get_campaign_daily_rollup: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: {
          ad_spend: number
          campaign_id: string
          campaign_name: string
          cancelled_orders: number
          clicks: number
          day: string
          delivered_orders: number
          delivery_rate: number
          external_campaign_id: string
          gross_revenue: number
          health: string
          impressions: number
          net_profit: number
          net_revenue: number
          orders_attributed: number
          poas: number
          real_roas: number
          return_rate: number
          returned_orders: number
        }[]
      }
      mkt_get_overview_kpis: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: Json
      }
      mkt_health_checks: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: {
          category: string
          detail: string
          metric: number
          ref_id: string
          ref_label: string
          severity: string
          title: string
        }[]
      }
      mkt_ingest_track: {
        Args: {
          p_event_name: string
          p_origin: string
          p_payload: Json
          p_session_id: string
          p_site_key: string
        }
        Returns: Json
      }
      mkt_list_ads: {
        Args: {
          p_adset_id: string
          p_brand_id: string
          p_from: string
          p_to: string
        }
        Returns: {
          ad_id: string
          ad_spend: number
          clicks: number
          creative_name: string
          delivered_orders: number
          effective_status: string
          external_ad_id: string
          impressions: number
          name: string
          net_profit: number
          net_revenue: number
          orders_attributed: number
          poas: number
          preview_url: string
          real_roas: number
          status: string
          thumbnail_url: string
        }[]
      }
      mkt_list_adsets: {
        Args: {
          p_brand_id: string
          p_campaign_id: string
          p_from: string
          p_to: string
        }
        Returns: {
          ad_spend: number
          adset_id: string
          clicks: number
          daily_budget: number
          delivered_orders: number
          effective_status: string
          external_adset_id: string
          impressions: number
          lifetime_budget: number
          name: string
          net_profit: number
          net_revenue: number
          orders_attributed: number
          poas: number
          real_roas: number
          status: string
        }[]
      }
      mkt_list_campaigns: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: {
          ad_spend: number
          campaign_id: string
          clicks: number
          delivered_orders: number
          effective_status: string
          external_campaign_id: string
          impressions: number
          name: string
          net_profit: number
          net_revenue: number
          objective: string
          orders_attributed: number
          poas: number
          real_roas: number
          returned_orders: number
          status: string
        }[]
      }
      mkt_post_meta_spend_day: {
        Args: { p_brand_id: string; p_day: string; p_force?: boolean }
        Returns: Json
      }
      mkt_post_meta_spend_window: {
        Args: { p_brand_id: string; p_days?: number; p_force?: boolean }
        Returns: Json
      }
      mkt_product_campaign_report: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: {
          campaign_id: string
          campaign_name: string
          delivered_units: number
          gross_revenue: number
          product_cost: number
          product_id: string
          product_name: string
          returned_units: number
          units_sold: number
        }[]
      }
      mkt_rebuild_window: {
        Args: { p_brand_id: string; p_days?: number; p_trigger?: string }
        Returns: Json
      }
      next_invoice_no: { Args: { _brand_id: string }; Returns: string }
      normalize_mobile_bd: { Args: { p_phone: string }; Returns: string }
      reapply_invoice_prefix: { Args: { _brand_id: string }; Returns: number }
      rebuild_all_marketing_attributions: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: number
      }
      rebuild_marketing_profit_snapshot: {
        Args: { p_order_id: string }
        Returns: string
      }
      rebuild_marketing_profit_snapshots: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: number
      }
      rebuild_meta_product_allocations_for_campaign: {
        Args: { p_campaign_id: string; p_since?: string; p_until?: string }
        Returns: undefined
      }
      rebuild_order_attribution: {
        Args: { p_order_id: string }
        Returns: string
      }
      recalc_product_rating: {
        Args: { _product_id: string }
        Returns: undefined
      }
      record_ar_payment: {
        Args: {
          _amount: number
          _ar_account_id: string
          _cash_account_id: string
          _notes?: string
          _order_id: string
          _payment_date?: string
          _reference_no?: string
        }
        Returns: string
      }
      record_bill_payment: {
        Args: {
          _amount: number
          _bill_id: string
          _cash_account_id: string
          _notes?: string
          _payment_date?: string
          _reference_no?: string
        }
        Returns: string
      }
      record_courier_expense: {
        Args: { _account_id?: string; _amount: number; _shipment_id: string }
        Returns: string
      }
      record_order_courier_expense: {
        Args: { _account_id?: string; _amount: number; _order_id: string }
        Returns: string
      }
      record_supplier_payment: {
        Args: {
          _account_id: string
          _amount: number
          _notes?: string
          _payment_date: string
          _reference_no?: string
          _supplier_id: string
        }
        Returns: string
      }
      release_order_lock: { Args: { _order_id: string }; Returns: undefined }
      release_stock: { Args: { _order_id: string }; Returns: undefined }
      reserve_stock: { Args: { _order_id: string }; Returns: undefined }
      run_recurring_rules: { Args: { _brand_id?: string }; Returns: Json }
      seed_default_coa: { Args: { _brand_id: string }; Returns: number }
      set_product_stock: {
        Args: {
          _new_qty: number
          _note?: string
          _product_id: string
          _reason?: string
        }
        Returns: Json
      }
      snapshot_order_item_profit_fields: {
        Args: { _order_id: string }
        Returns: undefined
      }
      transition_order_status: {
        Args: {
          _new_status: Database["public"]["Enums"]["order_status"]
          _note?: string
          _order_id: string
          _reason?: string
        }
        Returns: undefined
      }
      unmatch_statement_line: { Args: { _line_id: string }; Returns: undefined }
      update_product_inventory_fields: {
        Args: {
          _barcode?: string
          _cost_price?: number
          _low_stock_threshold?: number
          _product_id: string
          _reorder_point?: number
          _sku?: string
        }
        Returns: undefined
      }
      upsert_abandoned_cart: {
        Args: {
          _cart_items: Json
          _customer_email: string
          _customer_name: string
          _customer_phone: string
          _id: string
          _last_step: string
          _session_id: string
          _shipping_address: string
          _shipping_city: string
          _shipping_district: string
          _shipping_thana: string
          _subtotal: number
        }
        Returns: string
      }
      validate_coupon: {
        Args: { _code: string }
        Returns: {
          applicable_categories: Json
          applicable_products: Json
          code: string
          id: string
          max_discount: number
          min_order_amount: number
          type: string
          valid_from: string
          valid_until: string
          value: number
        }[]
      }
      void_journal_entry: {
        Args: { _entry_id: string; _reason: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "moderator"
        | "customer"
        | "customer_service"
        | "operations"
        | "packer"
        | "accountant"
        | "marketing_manager"
        | "warehouse_staff"
        | "cargo_agent"
      call_status:
        | "not_called"
        | "attempting"
        | "reached"
        | "no_response"
        | "wrong_number"
        | "customer_confirmed"
        | "customer_cancelled"
        | "needs_followup"
      confirmation_status:
        | "pending"
        | "confirmed"
        | "rejected"
        | "fake"
        | "on_hold"
        | "advance_pending"
      coupon_type: "percentage" | "fixed"
      discount_type: "flat" | "percent"
      imp_agent_ledger_dir: "credit" | "debit"
      imp_agent_ledger_kind:
        | "deposit"
        | "payment"
        | "adjustment"
        | "refund"
        | "opening_balance"
      imp_carton_status:
        | "ordered"
        | "at_china_warehouse"
        | "in_transit"
        | "arrived_bd"
        | "released"
        | "in_stock"
        | "cancelled"
      imp_payment_type:
        | "supplier_advance"
        | "supplier_payment"
        | "shipping"
        | "carton_release"
        | "supplier_balance"
        | "local_courier"
        | "adjustment"
      imp_po_status:
        | "pending_review"
        | "ordered"
        | "at_china_warehouse"
        | "in_transit"
        | "arrived_bd"
        | "partially_received"
        | "completed"
        | "cancelled"
      mkt_account_status: "active" | "paused" | "error" | "disconnected"
      mkt_attribution_source:
        | "utm"
        | "pixel"
        | "manual"
        | "product_link"
        | "phone_match"
      mkt_expense_category:
        | "influencer"
        | "content"
        | "photoshoot"
        | "agency"
        | "boost"
        | "other"
        | "meta_ads"
      mkt_sync_kind: "structure" | "insights" | "attribution" | "finance_post"
      mkt_sync_status: "running" | "success" | "error"
      order_priority: "low" | "normal" | "high" | "urgent"
      order_source: "website" | "facebook" | "manual" | "phone"
      order_status:
        | "new"
        | "confirmed"
        | "packaging"
        | "packed"
        | "ready_to_ship"
        | "shipped"
        | "in_transit"
        | "delivered"
        | "partial_delivered"
        | "returned"
        | "exchanged"
        | "damaged"
        | "cancelled"
        | "fake"
        | "on_hold"
        | "advance_payment_pending"
        | "incomplete"
        | "ready_to_pack"
        | "courier_entry"
        | "exchange"
        | "paid_return"
        | "unpaid_return"
        | "partial_return"
        | "pending_return"
        | "paid"
      payment_status: "unpaid" | "partial" | "paid" | "refunded"
      web_order_status:
        | "processing"
        | "incomplete"
        | "good_but_no_response"
        | "no_response"
        | "advance_payment"
        | "on_hold"
        | "complete"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "moderator",
        "customer",
        "customer_service",
        "operations",
        "packer",
        "accountant",
        "marketing_manager",
        "warehouse_staff",
        "cargo_agent",
      ],
      call_status: [
        "not_called",
        "attempting",
        "reached",
        "no_response",
        "wrong_number",
        "customer_confirmed",
        "customer_cancelled",
        "needs_followup",
      ],
      confirmation_status: [
        "pending",
        "confirmed",
        "rejected",
        "fake",
        "on_hold",
        "advance_pending",
      ],
      coupon_type: ["percentage", "fixed"],
      discount_type: ["flat", "percent"],
      imp_agent_ledger_dir: ["credit", "debit"],
      imp_agent_ledger_kind: [
        "deposit",
        "payment",
        "adjustment",
        "refund",
        "opening_balance",
      ],
      imp_carton_status: [
        "ordered",
        "at_china_warehouse",
        "in_transit",
        "arrived_bd",
        "released",
        "in_stock",
        "cancelled",
      ],
      imp_payment_type: [
        "supplier_advance",
        "supplier_payment",
        "shipping",
        "carton_release",
        "supplier_balance",
        "local_courier",
        "adjustment",
      ],
      imp_po_status: [
        "pending_review",
        "ordered",
        "at_china_warehouse",
        "in_transit",
        "arrived_bd",
        "partially_received",
        "completed",
        "cancelled",
      ],
      mkt_account_status: ["active", "paused", "error", "disconnected"],
      mkt_attribution_source: [
        "utm",
        "pixel",
        "manual",
        "product_link",
        "phone_match",
      ],
      mkt_expense_category: [
        "influencer",
        "content",
        "photoshoot",
        "agency",
        "boost",
        "other",
        "meta_ads",
      ],
      mkt_sync_kind: ["structure", "insights", "attribution", "finance_post"],
      mkt_sync_status: ["running", "success", "error"],
      order_priority: ["low", "normal", "high", "urgent"],
      order_source: ["website", "facebook", "manual", "phone"],
      order_status: [
        "new",
        "confirmed",
        "packaging",
        "packed",
        "ready_to_ship",
        "shipped",
        "in_transit",
        "delivered",
        "partial_delivered",
        "returned",
        "exchanged",
        "damaged",
        "cancelled",
        "fake",
        "on_hold",
        "advance_payment_pending",
        "incomplete",
        "ready_to_pack",
        "courier_entry",
        "exchange",
        "paid_return",
        "unpaid_return",
        "partial_return",
        "pending_return",
        "paid",
      ],
      payment_status: ["unpaid", "partial", "paid", "refunded"],
      web_order_status: [
        "processing",
        "incomplete",
        "good_but_no_response",
        "no_response",
        "advance_payment",
        "on_hold",
        "complete",
        "cancelled",
      ],
    },
  },
} as const
