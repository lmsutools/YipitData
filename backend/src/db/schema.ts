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
  unique,
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
  kpiId: integer('kpi_id').notNull().references(() => kpis.id),
  periodMonth: date('period_month').notNull(),
  estimateValue: numeric('estimate_value', { precision: 18, scale: 4 }).notNull(),
  estimateType: estimateTypeEnum('estimate_type').notNull(),
  asOfTimestamp: timestamp('as_of_timestamp', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  companyKpiPeriodTypeIdx: index('idx_estimates_company_kpi_period').on(t.companyId, t.kpiId, t.periodMonth),
  uniqueEstimate: unique('uq_estimate').on(t.companyId, t.kpiId, t.periodMonth, t.estimateType),
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

export const companiesRelations = relations(companies, ({ one, many }) => ({
  sector: one(sectors, { fields: [companies.sectorId], references: [sectors.id] }),
  estimates: many(kpiEstimates),
}))

export const kpisRelations = relations(kpis, ({ many }) => ({
  estimates: many(kpiEstimates),
}))

export const kpiEstimatesRelations = relations(kpiEstimates, ({ one }) => ({
  company: one(companies, { fields: [kpiEstimates.companyId], references: [companies.id] }),
  kpi: one(kpis, { fields: [kpiEstimates.kpiId], references: [kpis.id] }),
}))
