-- CleverReach: Status 'excluded_non_eu' erlauben.
--
-- Aussereuropaeische Betriebe werden aus CleverReach entfernt, in der DB aber
-- NICHT geloescht — nur markiert. Die bestehende Check-Constraint auf
-- cleverreach_status liess diesen Wert bisher nicht zu (PATCH 400), daher
-- erweitern wir die erlaubte Werteliste.

alter table public.service_providers
  drop constraint if exists service_providers_cleverreach_status_check;

alter table public.service_providers
  add constraint service_providers_cleverreach_status_check
  check (cleverreach_status is null or cleverreach_status in (
      'subscribed', 'unsubscribed', 'bounced', 'pending', 'error', 'excluded_non_eu'
  ));

comment on column public.service_providers.cleverreach_status is
    'Subscription-Status bei CleverReach: subscribed / unsubscribed / bounced / pending / error / excluded_non_eu (ausser-europaeisch, aus CleverReach entfernt, in DB nur markiert).';
