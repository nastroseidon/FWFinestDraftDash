-- Practice was originally required to close before official runs did, on the
-- assumption that practice always ends first. The league now reopens practice
-- whenever it likes, including after the official deadline has passed, so that
-- clause blocks a legitimate state.
--
-- The orderings that still have to hold are kept: the official window opens
-- before it closes, and selection closes last.

alter table league_settings
  drop constraint if exists window_order;

alter table league_settings
  add constraint window_order check (
    official_open_at < official_close_at
    and official_close_at <= selection_open_at
    and selection_open_at < selection_close_at
  );
