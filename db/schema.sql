-- Toured — database schema (PostgreSQL / Supabase-compatible)
-- Mirrors the objects used in js/store.js so the localStorage demo can be
-- swapped for a real backend. Listing columns follow RESO Data Dictionary names.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Users (if you use Supabase Auth, make id reference auth.users(id))
-- ---------------------------------------------------------------------------
create table app_user (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  display_name  text not null check (char_length(display_name) between 2 and 40),
  created_at    timestamptz not null default now(),
  is_banned     boolean not null default false
);

-- ---------------------------------------------------------------------------
-- Listings (populated from an MLS/IDX feed via RESO Web API)
-- ---------------------------------------------------------------------------
create table listing (
  listing_key            text primary key,          -- RESO ListingKey
  listing_id             text not null,             -- RESO ListingId (MLS #)
  originating_system     text,                      -- e.g. 'Stellar MLS'
  standard_status        text not null,             -- Active | Active Under Contract | Pending | Closed ...
  list_price             numeric(12,2) not null,
  original_list_price    numeric(12,2),
  unparsed_address       text not null,
  street_address         text,
  unit_number            text,
  city                   text,
  state_or_province      char(2),
  postal_code            text,
  neighborhood           text,
  latitude               double precision,
  longitude              double precision,
  property_type          text,                      -- Single Family | Condo | Townhouse ...
  bedrooms_total         smallint,
  bathrooms_total_integer smallint,
  living_area            integer,                   -- sq ft
  lot_size_square_feet   integer,
  year_built             smallint,
  stories_total          smallint,
  garage_spaces          smallint,
  association_fee        numeric(10,2),             -- monthly
  tax_annual_amount      numeric(10,2),
  pool_private_yn        boolean,
  waterfront_yn          boolean,
  view                   text,
  fireplace_yn           boolean,
  new_construction_yn    boolean,
  senior_community_yn    boolean,
  architectural_style    text,
  public_remarks         text,
  list_office_name       text,
  listing_contract_date  date,
  days_on_market         integer,
  modification_timestamp timestamptz,
  photos                 jsonb default '[]'::jsonb, -- RESO Media [{url, order, caption}]
  raw                    jsonb                      -- full feed record
);
create index listing_geo_idx    on listing (latitude, longitude);
create index listing_price_idx  on listing (list_price);
create index listing_status_idx on listing (standard_status);
create index listing_zip_idx    on listing (postal_code);

create table open_house (
  id           uuid primary key default gen_random_uuid(),
  listing_key  text not null references listing(listing_key) on delete cascade,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null
);

-- ---------------------------------------------------------------------------
-- Tours: the certification a review hangs off of.
-- method = 'self'            user ticked the certification box (MVP)
--          'agent_confirmed' buyer's/listing agent confirmed the showing
--          'showing_service' matched against ShowingTime/BrokerBay appointment
--          'geo_checkin'     user checked in on-site from the mobile app
-- ---------------------------------------------------------------------------
create table tour (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references app_user(id) on delete cascade,
  listing_key    text not null references listing(listing_key) on delete cascade,
  tour_date      date not null check (tour_date <= current_date),
  tour_type      text not null check (tour_type in ('open_house','private_showing','builder_tour')),
  method         text not null default 'self' check (method in ('self','agent_confirmed','showing_service','geo_checkin')),
  statement      text not null,                     -- exact certification text the user agreed to
  certified_at   timestamptz not null default now(),
  certified_ip   inet,
  unique (user_id, listing_key)
);

-- ---------------------------------------------------------------------------
-- Reviews (one per user per listing, requires a tour row)
-- ---------------------------------------------------------------------------
create table review (
  id                 uuid primary key default gen_random_uuid(),
  tour_id            uuid not null unique references tour(id) on delete cascade,
  user_id            uuid not null references app_user(id) on delete cascade,
  listing_key        text not null references listing(listing_key) on delete cascade,
  rating_overall     smallint not null check (rating_overall between 1 and 5),
  rating_condition   smallint check (rating_condition between 1 and 5),
  rating_matches     smallint check (rating_matches between 1 and 5),
  rating_layout      smallint check (rating_layout between 1 and 5),
  rating_neighborhood smallint check (rating_neighborhood between 1 and 5),
  rating_noise       smallint check (rating_noise between 1 and 5),
  title              text not null check (char_length(title) between 4 and 80),
  body               text not null check (char_length(body) between 30 and 2000),
  pros               text check (char_length(pros) <= 140),
  cons               text check (char_length(cons) <= 140),
  tags               text[] not null default '{}',
  status             text not null default 'published' check (status in ('published','pending_moderation','removed')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, listing_key)
);
create index review_listing_idx on review (listing_key, created_at desc);

create table review_helpful (
  review_id  uuid not null references review(id) on delete cascade,
  user_id    uuid not null references app_user(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);

create table review_report (
  id         uuid primary key default gen_random_uuid(),
  review_id  uuid not null references review(id) on delete cascade,
  user_id    uuid not null references app_user(id) on delete cascade,
  reason     text not null,
  created_at timestamptz not null default now()
);

create table saved_home (
  user_id     uuid not null references app_user(id) on delete cascade,
  listing_key text not null references listing(listing_key) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, listing_key)
);

create table saved_search (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references app_user(id) on delete cascade,
  name       text,
  query      text not null,                         -- the URL query string from js/filters.js toQuery()
  notify     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Per-listing review rollup used by search cards / the "Has tour reviews" filter
create view listing_review_summary as
select listing_key,
       count(*)                          as review_count,
       round(avg(rating_overall), 2)     as avg_overall,
       round(avg(rating_condition), 2)   as avg_condition,
       round(avg(rating_matches), 2)     as avg_matches,
       round(avg(rating_layout), 2)      as avg_layout,
       round(avg(rating_neighborhood),2) as avg_neighborhood,
       round(avg(rating_noise), 2)       as avg_noise
from review
where status = 'published'
group by listing_key;

-- ---------------------------------------------------------------------------
-- Supabase row-level security (uncomment when using Supabase)
-- ---------------------------------------------------------------------------
-- alter table review enable row level security;
-- create policy "reviews are public"     on review for select using (status = 'published');
-- create policy "own review insert"      on review for insert with check (auth.uid() = user_id
--   and exists (select 1 from tour t where t.id = tour_id and t.user_id = auth.uid() and t.listing_key = review.listing_key));
-- create policy "own review update"      on review for update using (auth.uid() = user_id);
-- create policy "own review delete"      on review for delete using (auth.uid() = user_id);
-- alter table tour enable row level security;
-- create policy "own tours"              on tour for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
