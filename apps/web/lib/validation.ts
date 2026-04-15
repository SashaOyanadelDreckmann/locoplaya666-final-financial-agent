import { z } from 'zod';

export const LoginSchema = z.object({
  email: z
    .string()
    .email('Email inválido')
    .min(1, 'Email requerido'),
  password: z
    .string()
    .min(8, 'Contraseña debe tener al menos 8 caracteres')
    .regex(/[A-Z]/, 'Debe contener una mayúscula')
    .regex(/[0-9]/, 'Debe contener un número'),
});

export const RegisterSchema = z.object({
  email: z
    .string()
    .email('Email inválido')
    .min(1, 'Email requerido'),
  password: z
    .string()
    .min(8, 'Contraseña debe tener al menos 8 caracteres')
    .regex(/[A-Z]/, 'Debe contener una mayúscula')
    .regex(/[0-9]/, 'Debe contener un número'),
  name: z
    .string()
    .min(2, 'Nombre debe tener al menos 2 caracteres')
    .max(100, 'Nombre muy largo'),
});

export const BudgetRowSchema = z.object({
  id: z.string().uuid(),
  category: z.string().min(1, 'Categoría requerida'),
  type: z.enum(['income', 'expense']),
  amount: z.number().positive('Cantidad debe ser positiva'),
  note: z.string().optional(),
});

export const SavedReportSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1, 'Título requerido'),
  group: z.enum(['plan_action', 'simulation', 'budget', 'diagnosis', 'other']),
  fileUrl: z.string().url('URL inválida'),
  createdAt: z.string().datetime(),
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type BudgetRow = z.infer<typeof BudgetRowSchema>;
export type SavedReport = z.infer<typeof SavedReportSchema>;
