"use client";

import { EditorialLandingPage } from "@/components/landing/EditorialLandingPage";

export default function HomePage() {
  return (
    <EditorialLandingPage
      routes={{
        home: "/",
        howItWorks: "#how-it-works",
        roles: "#roles",
        users: "/users",
        guide: "/users/knowledge",
        investor: "/investor",
        stationOwners: "/station-owners",
      }}
    />
  );
}
