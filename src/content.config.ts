import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const posts = defineCollection({
  loader: glob({ base: './src/content/posts', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    pubDate: z.coerce.date(),
    category: z.enum(['development', 'reading']),
    tags: z.array(z.string().trim().min(1)).default([]),
    draft: z.boolean().default(true),
    book: z.object({
      title: z.string().trim().min(1),
      author: z.string().trim().min(1),
    }).optional(),
  }),
});

export const collections = { posts };
