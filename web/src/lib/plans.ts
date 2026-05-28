export interface Plan {
  id: string;
  name: string;
  price: number;
  priceRWF: number;
  maxUsers: number;
  maxFlocks: number;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: 29,
    priceRWF: 42000,
    maxUsers: 5,
    maxFlocks: 3,
    features: [
      "Up to 5 team members",
      "Up to 3 flocks",
      "Check-in tracking",
      "Performance scoring",
      "Basic reports",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 79,
    priceRWF: 115000,
    maxUsers: 25,
    maxFlocks: 20,
    features: [
      "Up to 25 team members",
      "Up to 20 flocks",
      "Everything in Starter",
      "Odoo integration",
      "Business model analytics",
      "PDF reports",
      "Priority support",
    ],
  },
];
