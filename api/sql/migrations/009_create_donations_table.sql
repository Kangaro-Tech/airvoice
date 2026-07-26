CREATE TABLE IF NOT EXISTS donations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    completed_paid_phone_count INTEGER NOT NULL,
    percentage NUMERIC NOT NULL DEFAULT 3.0,
    chq_no VARCHAR(255),
    chq_amount NUMERIC(10, 2),
    delivery VARCHAR(50) CHECK (delivery IN ('POST', 'COURIER', 'OFFICE_COLLECT', 'CAMP_HAND_OVER')),
    sending_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
