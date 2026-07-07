export type SupportService = {
  service_id: string;
  name: string;
};

export const supportServices: SupportService[] = [
  { service_id: "virtual-ngn-accounts", name: "Virtual NGN Accounts" },
  { service_id: "usd-virtual-cards", name: "USD Virtual Cards" },
  { service_id: "contactless-cards", name: "Contactless Cards" },
  { service_id: "stablecoin-payments", name: "Stablecoin Payments" },
  { service_id: "api-integration", name: "API Integration" },
  { service_id: "white-label-infrastructure", name: "White-label Infrastructure" },
  { service_id: "payment-links", name: "Payment Links" },
  { service_id: "bank-settlement", name: "Bank Settlement" },
  { service_id: "vtu", name: "VTU" },
  { service_id: "bills-and-subscription", name: "Bills and Subscription" },
  { service_id: "airtime", name: "Airtime" },
  { service_id: "data", name: "Data" },
  { service_id: "electricity", name: "Electricity" },
  { service_id: "cable-tv-subscription", name: "Cable TV Subscription" },
  { service_id: "betting-platform-funding", name: "Betting Platform Funding" }
];

export function getSupportService(serviceId: string) {
  return supportServices.find((service) => service.service_id === serviceId) ?? null;
}
