import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    invalid?:boolean;
    user: {
      id: string;
      authVersion?:number;
      role: string;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    authVersion?:number;
    invalid?:boolean;
    id?: string;
    role?: string;
  }
}
