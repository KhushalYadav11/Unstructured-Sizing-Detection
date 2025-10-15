-- Add weight column to projects table
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "weight" real;