import "next-auth";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: string;
      storeId: string;
      permissions: string[];
    };
  }

  interface User {
    role: string;
    storeId: string;
    permissions: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    storeId?: string;
    permissions?: string[];
    name?: string;
  }
}
