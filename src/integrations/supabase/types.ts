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
        Relationships: []
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
      categories: {
        Row: {
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
        Relationships: []
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
        ]
      }
      coupons: {
        Row: {
          applicable_categories: Json | null
          applicable_products: Json | null
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
        Relationships: []
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
        Relationships: []
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
      low_stock_alerts: {
        Row: {
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
          created_at?: string
          current_stock?: number
          id?: string
          is_resolved?: boolean
          product_id?: string
          resolved_at?: string | null
          threshold?: number
          variant_id?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          cost_price: number | null
          created_at: string
          discount_amount: number
          discount_type: Database["public"]["Enums"]["discount_type"] | null
          id: string
          image: string | null
          line_total: number | null
          name: string
          order_id: string
          price: number
          product_id: string
          quantity: number
          tax_amount: number
          unit_price: number | null
          user_id: string | null
          variant_id: string | null
          variant_label: string | null
        }
        Insert: {
          cost_price?: number | null
          created_at?: string
          discount_amount?: number
          discount_type?: Database["public"]["Enums"]["discount_type"] | null
          id?: string
          image?: string | null
          line_total?: number | null
          name: string
          order_id: string
          price: number
          product_id: string
          quantity?: number
          tax_amount?: number
          unit_price?: number | null
          user_id?: string | null
          variant_id?: string | null
          variant_label?: string | null
        }
        Update: {
          cost_price?: number | null
          created_at?: string
          discount_amount?: number
          discount_type?: Database["public"]["Enums"]["discount_type"] | null
          id?: string
          image?: string | null
          line_total?: number | null
          name?: string
          order_id?: string
          price?: number
          product_id?: string
          quantity?: number
          tax_amount?: number
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
          admin_notes: string | null
          advance_amount: number
          alternate_phone: string | null
          assigned_to: string | null
          auto_call_enabled: boolean | null
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
          partial_amount: number | null
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
          admin_notes?: string | null
          advance_amount?: number
          alternate_phone?: string | null
          assigned_to?: string | null
          auto_call_enabled?: boolean | null
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
          partial_amount?: number | null
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
          admin_notes?: string | null
          advance_amount?: number
          alternate_phone?: string | null
          assigned_to?: string | null
          auto_call_enabled?: boolean | null
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
          partial_amount?: number | null
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
          benefits: Json
          category_id: string | null
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
          reviews: number
          shipping_fee_inside: number | null
          shipping_fee_outside: number | null
          slug: string
          specs: Json
          stock: number
          title: string
          updated_at: string
        }
        Insert: {
          benefits?: Json
          category_id?: string | null
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
          reviews?: number
          shipping_fee_inside?: number | null
          shipping_fee_outside?: number | null
          slug: string
          specs?: Json
          stock?: number
          title: string
          updated_at?: string
        }
        Update: {
          benefits?: Json
          category_id?: string | null
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
          reviews?: number
          shipping_fee_inside?: number | null
          shipping_fee_outside?: number | null
          slug?: string
          specs?: Json
          stock?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
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
          created_at: string
          delta: number
          id: string
          note: string | null
          product_id: string
          reason: string
          stock_after: number
          stock_before: number
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          note?: string | null
          product_id: string
          reason?: string
          stock_after: number
          stock_before: number
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          note?: string | null
          product_id?: string
          reason?: string
          stock_after?: number
          stock_before?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
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
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
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
      finalize_order_on_confirm: {
        Args: { _order_id: string }
        Returns: undefined
      }
      get_customer_stats: { Args: { p_user_id: string }; Returns: Json }
      hard_delete_order: { Args: { _order_id: string }; Returns: undefined }
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
      is_admin: { Args: never; Returns: boolean }
      is_guest_order: { Args: { _order_id: string }; Returns: boolean }
      is_recent_guest_order: { Args: { _order_id: string }; Returns: boolean }
      log_order_view: { Args: { p_order_id: string }; Returns: undefined }
      mark_abandoned_cart_converted: {
        Args: { _id: string; _order_id: string }
        Returns: undefined
      }
      recalc_product_rating: {
        Args: { _product_id: string }
        Returns: undefined
      }
      release_order_lock: { Args: { _order_id: string }; Returns: undefined }
      release_stock: { Args: { _order_id: string }; Returns: undefined }
      reserve_stock: { Args: { _order_id: string }; Returns: undefined }
      transition_order_status: {
        Args: {
          _new_status: Database["public"]["Enums"]["order_status"]
          _note?: string
          _order_id: string
          _reason?: string
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
