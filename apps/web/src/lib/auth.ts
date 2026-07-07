import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "./db";
import { parsePermissions } from "./permissions";

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });
        if (!user || !user.email) return null;
        if (!user.isActive) return null;
        if (user.role !== "ADMIN" && user.role !== "OFFICE") return null;

        const valid = await compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        const permissions =
          user.role === "ADMIN" ? [] : parsePermissions(user.permissions);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          storeId: user.storeId,
          permissions,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.storeId = user.storeId;
        token.permissions = user.permissions;
        return token;
      }

      if (!token.sub) return token;

      const dbUser = await prisma.user.findUnique({
        where: { id: token.sub },
        select: { role: true, storeId: true, permissions: true, isActive: true, name: true },
      });

      if (
        !dbUser ||
        !dbUser.isActive ||
        (dbUser.role !== "ADMIN" && dbUser.role !== "OFFICE")
      ) {
        token.role = "INACTIVE";
        token.permissions = [];
        return token;
      }

      token.role = dbUser.role;
      token.storeId = dbUser.storeId;
      token.name = dbUser.name;
      token.permissions =
        dbUser.role === "ADMIN" ? [] : parsePermissions(dbUser.permissions);

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.role = token.role as string;
        session.user.storeId = token.storeId as string;
        session.user.permissions = (token.permissions as string[]) ?? [];
        if (token.name) session.user.name = token.name as string;
      }
      return session;
    },
  },
};
