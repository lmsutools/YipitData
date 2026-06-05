import {
  pgTable,
  serial,
  varchar,
  text,
  numeric,
  timestamp,
  date,
  integer,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const estimateTypeEnum = pgEnum('estimate_type', ['historical', 'mtd'])

export const sectors = pgTable('sectors', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const retailers = pgTable('retailers', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  slug: varchar('slug', { length: 200 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  sectorId: integer('sector_id').notNull().references(() => sectors.id),
  name: varchar('name', { length: 200 }).notNull(),
  slug: varchar('slug', { length: 200 }).notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const kpis = pgTable('kpis', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  unit: varchar('unit', { length: 50 }).notNull(),
  description: text('description'),
})

export const kpiEstimates = pgTable('kpi_estimates', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull().references(() => companies.id),
  retailerId: integer('retailer_id').notNull().references(() => retailers.id),
  kpiId: integer('kpi_id').notNull().references(() => kpis.id),
  periodMonth: date('period_month').notNull(),
  estimateValue: numeric('estimate_value', { precision: 18, scale: 4 }).notNull(),
  estimateType: estimateTypeEnum('estimate_type').notNull(),
  asOfTimestamp: timestamp('as_of_timestamp', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  companyRetailerKpiPeriodIdx: index('idx_estimates_company_retailer_kpi_period').on(
    t.companyId, t.retailerId, t.kpiId, t.periodMonth,
  ),
  // uq_historical_estimate: partial unique index created via raw SQL (drizzle-kit push doesn't support WHERE predicates).
  // Definition: UNIQUE (company_id, retailer_id, kpi_id, period_month, estimate_type) WHERE as_of_timestamp IS NULL
  // This enforces one historical row per (company, retailer, kpi, period) while allowing multiple MTD intraday snapshots.
}))

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 200 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 200 }).notNull(),
  role: varchar('role', { length: 50 }).notNull().default('viewer'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Relations
export const sectorsRelations = relations(sectors, ({ many }) => ({
  companies: many(companies),
}))

export const retailersRelations = relations(retailers, ({ many }) => ({
  estimates: many(kpiEstimates),
}))

export const companiesRelations = relations(companies, ({ one, many }) => ({
  sector: one(sectors, { fields: [companies.sectorId], references: [sectors.id] }),
  estimates: many(kpiEstimates),
}))

export const kpisRelations = relations(kpis, ({ many }) => ({
  estimates: many(kpiEstimates),
}))

export const kpiEstimatesRelations = relations(kpiEstimates, ({ one }) => ({
  company: one(companies, { fields: [kpiEstimates.companyId], references: [companies.id] }),
  retailer: one(retailers, { fields: [kpiEstimates.retailerId], references: [retailers.id] }),
  kpi: one(kpis, { fields: [kpiEstimates.kpiId], references: [kpis.id] }),
}))
