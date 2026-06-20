ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'return_in_transit';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'completed';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'returned';