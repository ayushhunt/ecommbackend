// Create a file src/types/express/index.d.ts

import { User } from '@prisma/client'; // Adjust the import path based on your project

declare global {
  namespace Express {
    interface Request {
      user: User; // Using optional chaining in case middleware hasn't run
    }
  }
}
export {}