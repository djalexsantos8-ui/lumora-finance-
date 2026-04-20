-- Limpeza de dados invalidos + hardening do title de jobs.
-- Totalmente idempotente e seguro: preserva qualquer job com valor financeiro.

-- ═══════ PARTE 1: LIMPEZA ═══════

-- 1a. Drafts sem valor = soft delete
UPDATE public.jobs
   SET deleted_at = NOW()
 WHERE deleted_at IS NULL
   AND (
         title IS NULL
      OR length(btrim(title)) < 2
      OR lower(btrim(title)) ~ '^(freelance\s+)?sem\s+t[íi]tulo'
      OR lower(btrim(title)) ~ '^job\s+sem\s+t[íi]tulo'
      OR lower(btrim(title)) ~ '^(untitled|new\s+job|novo\s+job|novo\s+freelance)\s*$'
   )
   AND COALESCE(revenue_total, 0) = 0
   AND COALESCE(cost_total,    0) = 0
   AND COALESCE(amount_paid,   0) = 0
   AND COALESCE(total_value,   0) = 0;

-- 1b. Registros restantes com titulo invalido = renomeia para placeholder valido.
--     IMPORTANTE: o CHECK constraint se aplica a TODAS as linhas (incluindo
--     deleted_at IS NOT NULL). Por isso aqui NAO filtramos por deleted_at:
--     precisamos sanitizar rascunhos soft-deleted historicamente tambem.
UPDATE public.jobs
   SET title = 'Registro migrado ' || substring(id::text, 1, 8)
 WHERE (
         title IS NULL
      OR length(btrim(title)) < 2
      OR lower(btrim(title)) ~ '^(freelance\s+)?sem\s+t[íi]tulo'
      OR lower(btrim(title)) ~ '^job\s+sem\s+t[íi]tulo'
      OR lower(btrim(title)) ~ '^(untitled|new\s+job|novo\s+job|novo\s+freelance)\s*$'
   );

-- ═══════ PARTE 2: BLINDAGEM ═══════

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_title_not_empty;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_title_valid;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_title_valid CHECK (
    title IS NOT NULL
    AND length(btrim(title)) >= 2
    AND lower(btrim(title)) !~ '^(freelance\s+)?sem\s+t[íi]tulo'
    AND lower(btrim(title)) !~ '^job\s+sem\s+t[íi]tulo'
    AND lower(btrim(title)) !~ '^(untitled|new\s+job|novo\s+job|novo\s+freelance)\s*$'
  );

CREATE OR REPLACE FUNCTION public.jobs_normalize_strings()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.title := btrim(NEW.title);
  IF NEW.client_name IS NOT NULL THEN
    NEW.client_name := btrim(NEW.client_name);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jobs_normalize_strings_trg ON public.jobs;

CREATE TRIGGER jobs_normalize_strings_trg
  BEFORE INSERT OR UPDATE OF title, client_name ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.jobs_normalize_strings();

-- ═══════ PARTE 3: VALIDACAO ═══════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_title_valid') THEN
    RAISE EXCEPTION 'FAIL: constraint nao foi criada';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'jobs_normalize_strings') THEN
    RAISE EXCEPTION 'FAIL: funcao nao existe';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'jobs_normalize_strings_trg') THEN
    RAISE EXCEPTION 'FAIL: trigger nao existe';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.jobs
     WHERE deleted_at IS NULL
       AND (
         title IS NULL
         OR length(btrim(title)) < 2
         OR lower(btrim(title)) ~ '^(freelance\s+)?sem\s+t[íi]tulo'
         OR lower(btrim(title)) ~ '^job\s+sem\s+t[íi]tulo'
         OR lower(btrim(title)) ~ '^(untitled|new\s+job|novo\s+job|novo\s+freelance)\s*$'
       )
  ) THEN
    RAISE EXCEPTION 'FAIL: ainda existem jobs ativos com titulo invalido';
  END IF;

  RAISE NOTICE 'OK: dados limpos + constraint + trigger + funcao';
END $$;
