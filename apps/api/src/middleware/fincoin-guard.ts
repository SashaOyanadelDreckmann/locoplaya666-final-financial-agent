import type { NextFunction, Request, Response } from 'express';
import type { FincoinOperation } from '@financial-agent/shared';
import { fincoinsDepleted } from '../http/api.errors';
import {
  canAffordOperation,
  ensureFincoinDepletionHandled,
  fincoinUsagePayload,
  getFincoinUsageForUser,
} from '../services/fincoin.service';

declare global {
  namespace Express {
    interface Request {
      fincoinUsage?: ReturnType<typeof getFincoinUsageForUser>;
    }
  }
}

export function requireSpendableFincoins(operation: FincoinOperation) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = req.authenticatedUser;
      if (!user) {
        return next();
      }

      const usage = getFincoinUsageForUser(user);
      req.fincoinUsage = usage;

      if (usage.depleted || !canAffordOperation(usage, operation)) {
        const summaries = await ensureFincoinDepletionHandled(user.id);
        return next(
          fincoinsDepleted(
            'Tus Fincoins se agotaron. El agente queda en pausa y ya no se realizan llamadas con costo.',
            {
              usage: fincoinUsagePayload(usage),
              closure_summaries: summaries,
            },
          ),
        );
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}
