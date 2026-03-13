/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    user?: {
      userId: number;
      email: string;
      name: string;
    };
  }
}
