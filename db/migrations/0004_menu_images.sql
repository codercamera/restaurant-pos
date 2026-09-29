-- Up to 4 photos per dish (enforced by the app), exactly one of them the main "sample" photo.
-- Photos are compressed JPEGs stored as base64 text and served by /api/menu-images/[id].
create table if not exists menu_item_images (
  id text primary key default (lower(hex(randomblob(16)))),
  menu_item_id text not null references menu_items(id),
  content_type text not null default 'image/jpeg',
  data_b64 text not null,
  size_bytes integer not null default 0,
  sort_order integer not null default 0,
  is_primary integer not null default 0 check (is_primary in (0,1)),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists menu_item_images_item_idx on menu_item_images (menu_item_id, sort_order);
create unique index if not exists menu_item_images_primary_idx on menu_item_images (menu_item_id) where is_primary = 1;
