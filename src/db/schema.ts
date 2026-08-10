import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  uuid,
  json,
} from "drizzle-orm/pg-core";

// Admin user table - first login creates the admin
export const admins = pgTable("admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Login attempts for brute-force protection
export const loginAttempts = pgTable("login_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  ip: text("ip").notNull(),
  attemptedAt: timestamp("attempted_at").defaultNow().notNull(),
  success: boolean("success").notNull().default(false),
});

// Subscriptions
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(), // internal panel name
  title: text("title").notNull().default(""), // displayed in VPN client (emoji support)
  slug: text("slug").notNull().unique(), // URL-safe identifier
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"), // null = no expiry
  autoUpdateMinutes: integer("auto_update_minutes").notNull().default(60),
  clientUpdateHours: integer("client_update_hours").notNull().default(24),
  uniqueHits: integer("unique_hits").notNull().default(0),
  totalHits: integer("total_hits").notNull().default(0),
  logoUrl: text("logo_url").default(""),
  pageTitle: text("page_title").default(""),
});

// Subscription keys - individual VPN keys
export const subscriptionKeys = pgTable("subscription_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  subscriptionId: uuid("subscription_id")
    .notNull()
    .references(() => subscriptions.id, { onDelete: "cascade" }),
  keyValue: text("key_value").notNull(), // the actual vless://, vmess:// etc
  customName: text("custom_name").default(""), // custom display name
  originalName: text("original_name").default(""), // original name from source
  sourceType: text("source_type").notNull().default("manual"), // 'manual' | 'remote'
  sourceUrl: text("source_url").default(""), // URL of the remote source
  isEnabled: boolean("is_enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Fingerprint for deduplication: hash of the key without name
  keyFingerprint: text("key_fingerprint").notNull().default(""),
});

// Remote sources for subscriptions
export const remoteSources = pgTable("remote_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  subscriptionId: uuid("subscription_id")
    .notNull()
    .references(() => subscriptions.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  lastFetchedAt: timestamp("last_fetched_at"),
  lastStatus: text("last_status").default("pending"), // 'ok' | 'error' | 'pending'
  selectedKeys: json("selected_keys").$type<string[]>().default([]), // fingerprints of selected keys
  keyNames: json("key_names").$type<Record<string, string>>().default({}), // fingerprint -> custom name
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Access log
export const accessLogs = pgTable("access_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  subscriptionId: uuid("subscription_id")
    .notNull()
    .references(() => subscriptions.id, { onDelete: "cascade" }),
  ip: text("ip").notNull(),
  userAgent: text("user_agent").default(""),
  deviceName: text("device_name").default(""),
  deviceType: text("device_type").default(""), // 'browser' | 'vpn_client' | 'router'
  accessedAt: timestamp("accessed_at").defaultNow().notNull(),
});

// Settings (for logo, page title, etc.)
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
});
