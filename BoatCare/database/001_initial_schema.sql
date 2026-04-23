-- ============================================
-- BoatCare Phase 2: Supabase Database Schema
-- ============================================
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================

-- User roles
CREATE TYPE user_role AS ENUM ('boat_owner', 'service_provider', 'admin');

-- Service provider types
CREATE TYPE provider_type AS ENUM (
  'marina',
  'werft',
  'haendler',
  'segelmacher',
  'motorenspezialist',
  'elektronik',
  'lackierer',
  'sonstiges'
);

-- Equipment categories (18 Kategorien aus Phase 1)
CREATE TYPE equipment_category AS ENUM (
  'navigation',
  'sicherheit',
  'kommunikation',
  'antrieb',
  'elektrik',
  'sanitaer',
  'deck',
  'rigg',
  'segel',
  'anker',
  'beleuchtung',
  'heizung',
  'kuehlung',
  'entertainment',
  'tender',
  'werkzeug',
  'reinigung',
  'sonstiges'
);

-- ============================================
-- USERS (extends Supabase auth.users)
-- ============================================

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  role user_role NOT NULL DEFAULT 'boat_owner',
  display_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- BOATS
-- ============================================

CREATE TABLE public.boats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT, -- Segelboot, Motorboot, Katamaran, etc.
  manufacturer TEXT,
  model TEXT,
  year INTEGER CHECK (year > 1800 AND year <= EXTRACT(YEAR FROM NOW()) + 1),
  length_m DECIMAL(5,2),
  width_m DECIMAL(5,2),
  draft_m DECIMAL(5,2),
  weight_kg INTEGER,
  engine_type TEXT,
  engine_power_hp INTEGER,
  fuel_type TEXT,
  fuel_capacity_l INTEGER,
  water_capacity_l INTEGER,
  home_port TEXT,
  registration_number TEXT,
  flag_country TEXT,
  insurance_company TEXT,
  insurance_number TEXT,
  image_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_boats_owner ON boats(owner_id);

-- ============================================
-- EQUIPMENT
-- ============================================

CREATE TABLE public.equipment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  boat_id UUID NOT NULL REFERENCES public.boats(id) ON DELETE CASCADE,
  category equipment_category NOT NULL,
  name TEXT NOT NULL,
  manufacturer TEXT,
  model TEXT,
  serial_number TEXT,
  purchase_date DATE,
  purchase_price DECIMAL(10,2),
  warranty_until DATE,
  maintenance_interval_months INTEGER,
  last_maintenance DATE,
  next_maintenance DATE,
  notes TEXT,
  image_url TEXT,
  is_critical BOOLEAN DEFAULT FALSE, -- Sicherheitsrelevant
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_equipment_boat ON equipment(boat_id);
CREATE INDEX idx_equipment_category ON equipment(category);
CREATE INDEX idx_equipment_next_maintenance ON equipment(next_maintenance);

-- Auto-calculate next_maintenance
CREATE OR REPLACE FUNCTION calculate_next_maintenance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.last_maintenance IS NOT NULL AND NEW.maintenance_interval_months IS NOT NULL THEN
    NEW.next_maintenance := NEW.last_maintenance + (NEW.maintenance_interval_months || ' months')::INTERVAL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER equipment_maintenance_calc
  BEFORE INSERT OR UPDATE ON equipment
  FOR EACH ROW EXECUTE FUNCTION calculate_next_maintenance();

-- ============================================
-- MAINTENANCE LOGS
-- ============================================

CREATE TABLE public.maintenance_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  equipment_id UUID NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  performed_at DATE NOT NULL DEFAULT CURRENT_DATE,
  performed_by TEXT,
  description TEXT,
  cost DECIMAL(10,2),
  service_provider_id UUID REFERENCES public.service_providers(id),
  receipt_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_maintenance_equipment ON maintenance_logs(equipment_id);

-- Update equipment.last_maintenance when log is added
CREATE OR REPLACE FUNCTION update_equipment_maintenance()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE equipment
  SET last_maintenance = NEW.performed_at,
      updated_at = NOW()
  WHERE id = NEW.equipment_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER maintenance_log_update
  AFTER INSERT ON maintenance_logs
  FOR EACH ROW EXECUTE FUNCTION update_equipment_maintenance();

-- ============================================
-- SERVICE PROVIDERS
-- ============================================

CREATE TABLE public.service_providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID REFERENCES public.profiles(id), -- NULL = Community-erstellt
  name TEXT NOT NULL,
  type provider_type NOT NULL,
  description TEXT,
  
  -- Adresse
  street TEXT,
  postal_code TEXT,
  city TEXT,
  country TEXT DEFAULT 'Deutschland',
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  
  -- Kontakt
  phone TEXT,
  email TEXT,
  website TEXT,
  
  -- Öffnungszeiten als JSON
  opening_hours JSONB DEFAULT '{
    "monday": {"open": "09:00", "close": "17:00"},
    "tuesday": {"open": "09:00", "close": "17:00"},
    "wednesday": {"open": "09:00", "close": "17:00"},
    "thursday": {"open": "09:00", "close": "17:00"},
    "friday": {"open": "09:00", "close": "17:00"},
    "saturday": {"closed": true},
    "sunday": {"closed": true}
  }'::JSONB,
  
  -- Bilder
  logo_url TEXT,
  cover_image_url TEXT,
  gallery_urls TEXT[], -- Array of image URLs
  
  -- Status
  is_verified BOOLEAN DEFAULT FALSE,
  is_premium BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Bewertungen (denormalisiert für Performance)
  average_rating DECIMAL(2,1) DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  
  -- Spezialitäten/Services als Tags
  services TEXT[],
  brands TEXT[], -- Vertretene Marken
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_providers_location ON service_providers(latitude, longitude);
CREATE INDEX idx_providers_type ON service_providers(type);
CREATE INDEX idx_providers_city ON service_providers(city);
CREATE INDEX idx_providers_rating ON service_providers(average_rating DESC);

-- Full-text search
CREATE INDEX idx_providers_search ON service_providers 
  USING GIN (to_tsvector('german', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(city, '')));

-- ============================================
-- REVIEWS
-- ============================================

CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  comment TEXT,
  
  -- Detailbewertungen
  rating_service INTEGER CHECK (rating_service >= 1 AND rating_service <= 5),
  rating_quality INTEGER CHECK (rating_quality >= 1 AND rating_quality <= 5),
  rating_price INTEGER CHECK (rating_price >= 1 AND rating_price <= 5),
  
  -- Antwort vom Betrieb
  response TEXT,
  response_date TIMESTAMPTZ,
  
  -- Moderation
  is_approved BOOLEAN DEFAULT TRUE,
  is_reported BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ein User kann jeden Betrieb nur einmal bewerten
  UNIQUE(service_provider_id, author_id)
);

CREATE INDEX idx_reviews_provider ON reviews(service_provider_id);
CREATE INDEX idx_reviews_author ON reviews(author_id);

-- Update service_provider average_rating when review changes
CREATE OR REPLACE FUNCTION update_provider_rating()
RETURNS TRIGGER AS $$
DECLARE
  avg_rating DECIMAL(2,1);
  total_count INTEGER;
BEGIN
  SELECT AVG(rating)::DECIMAL(2,1), COUNT(*)
  INTO avg_rating, total_count
  FROM reviews
  WHERE service_provider_id = COALESCE(NEW.service_provider_id, OLD.service_provider_id)
    AND is_approved = TRUE;
  
  UPDATE service_providers
  SET average_rating = COALESCE(avg_rating, 0),
      review_count = total_count,
      updated_at = NOW()
  WHERE id = COALESCE(NEW.service_provider_id, OLD.service_provider_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER review_rating_update
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_provider_rating();

-- ============================================
-- FAVORITES
-- ============================================

CREATE TABLE public.favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  service_provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, service_provider_id)
);

CREATE INDEX idx_favorites_user ON favorites(user_id);

-- ============================================
-- CHAT MESSAGES
-- ============================================

CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel TEXT NOT NULL DEFAULT 'general',
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  
  -- Optional: Reply to another message
  reply_to_id UUID REFERENCES public.chat_messages(id),
  
  -- Moderation
  is_deleted BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_channel ON chat_messages(channel, created_at DESC);
CREATE INDEX idx_chat_author ON chat_messages(author_id);

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE boats ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Helper function: Check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PROFILES POLICIES
-- ============================================

CREATE POLICY "Users can view all profiles" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- ============================================
-- BOATS POLICIES
-- ============================================

CREATE POLICY "Users can view own boats" ON boats
  FOR SELECT USING (owner_id = auth.uid() OR is_admin());

CREATE POLICY "Users can insert own boats" ON boats
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own boats" ON boats
  FOR UPDATE USING (owner_id = auth.uid() OR is_admin());

CREATE POLICY "Users can delete own boats" ON boats
  FOR DELETE USING (owner_id = auth.uid() OR is_admin());

-- ============================================
-- EQUIPMENT POLICIES
-- ============================================

CREATE POLICY "Users can view own equipment" ON equipment
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM boats WHERE boats.id = equipment.boat_id AND boats.owner_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY "Users can insert equipment for own boats" ON equipment
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM boats WHERE boats.id = boat_id AND boats.owner_id = auth.uid())
  );

CREATE POLICY "Users can update own equipment" ON equipment
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM boats WHERE boats.id = equipment.boat_id AND boats.owner_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY "Users can delete own equipment" ON equipment
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM boats WHERE boats.id = equipment.boat_id AND boats.owner_id = auth.uid())
    OR is_admin()
  );

-- ============================================
-- MAINTENANCE LOGS POLICIES
-- ============================================

CREATE POLICY "Users can view own maintenance logs" ON maintenance_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM equipment e
      JOIN boats b ON e.boat_id = b.id
      WHERE e.id = maintenance_logs.equipment_id AND b.owner_id = auth.uid()
    )
    OR is_admin()
  );

CREATE POLICY "Users can insert maintenance logs for own equipment" ON maintenance_logs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM equipment e
      JOIN boats b ON e.boat_id = b.id
      WHERE e.id = equipment_id AND b.owner_id = auth.uid()
    )
  );

-- ============================================
-- SERVICE PROVIDERS POLICIES
-- ============================================

CREATE POLICY "Anyone can view active service providers" ON service_providers
  FOR SELECT USING (is_active = TRUE OR owner_id = auth.uid() OR is_admin());

CREATE POLICY "Authenticated users can insert providers" ON service_providers
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Owners can update own provider" ON service_providers
  FOR UPDATE USING (owner_id = auth.uid() OR is_admin());

CREATE POLICY "Admins can delete providers" ON service_providers
  FOR DELETE USING (is_admin());

-- ============================================
-- REVIEWS POLICIES
-- ============================================

CREATE POLICY "Anyone can view approved reviews" ON reviews
  FOR SELECT USING (is_approved = TRUE OR author_id = auth.uid() OR is_admin());

CREATE POLICY "Authenticated users can insert reviews" ON reviews
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND author_id = auth.uid());

CREATE POLICY "Authors can update own reviews" ON reviews
  FOR UPDATE USING (author_id = auth.uid() OR is_admin());

CREATE POLICY "Authors can delete own reviews" ON reviews
  FOR DELETE USING (author_id = auth.uid() OR is_admin());

-- ============================================
-- FAVORITES POLICIES
-- ============================================

CREATE POLICY "Users can view own favorites" ON favorites
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own favorites" ON favorites
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own favorites" ON favorites
  FOR DELETE USING (user_id = auth.uid());

-- ============================================
-- CHAT MESSAGES POLICIES
-- ============================================

CREATE POLICY "Anyone can view chat messages" ON chat_messages
  FOR SELECT USING (is_deleted = FALSE OR is_admin());

CREATE POLICY "Authenticated users can insert messages" ON chat_messages
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND author_id = auth.uid());

CREATE POLICY "Authors can delete own messages" ON chat_messages
  FOR UPDATE USING (author_id = auth.uid() OR is_admin());

-- ============================================
-- STORAGE BUCKETS
-- ============================================

-- Run these in Supabase Dashboard > Storage

-- INSERT INTO storage.buckets (id, name, public) VALUES 
--   ('boat-images', 'boat-images', true),
--   ('equipment-images', 'equipment-images', true),
--   ('provider-images', 'provider-images', true),
--   ('avatars', 'avatars', true);

-- Storage policies would be configured in Dashboard

-- ============================================
-- SAMPLE DATA (Optional)
-- ============================================

-- Uncomment to insert sample service providers

/*
INSERT INTO service_providers (name, type, description, street, postal_code, city, latitude, longitude, phone, email, website, is_verified)
VALUES 
  ('Marina Müller', 'marina', 'Moderne Marina mit 200 Liegeplätzen', 'Hafenstraße 1', '24159', 'Kiel', 54.3233, 10.1228, '+49 431 12345', 'info@marina-mueller.de', 'https://marina-mueller.de', true),
  ('Bootswerft Schmidt', 'werft', 'Traditionelle Werft seit 1950', 'Werftweg 15', '24143', 'Kiel', 54.3156, 10.1456, '+49 431 67890', 'kontakt@werft-schmidt.de', 'https://werft-schmidt.de', true),
  ('Segelmacherei Nordwind', 'segelmacher', 'Segel nach Maß', 'Segelweg 3', '18119', 'Rostock-Warnemünde', 54.1780, 12.0893, '+49 381 11111', 'info@nordwind-segel.de', 'https://nordwind-segel.de', false),
  ('Yachtzubehör Hansen', 'haendler', 'Alles für den Wassersport', 'Marktplatz 8', '23730', 'Neustadt in Holstein', 54.1063, 10.8136, '+49 4561 22222', 'shop@hansen-yachting.de', 'https://hansen-yachting.de', true);
*/
