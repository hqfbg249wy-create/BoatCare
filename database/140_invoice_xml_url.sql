-- 140_invoice_xml_url.sql
-- Speichert die signierte URL der E-Rechnung (EN 16931 / CII-XML, Kern von
-- ZUGFeRD bzw. XRechnung), die bei der Versandbestaetigung zusaetzlich zur
-- PDF-Rechnung erzeugt wird.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS invoice_xml_url text;
