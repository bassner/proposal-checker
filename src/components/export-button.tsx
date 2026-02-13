"use client";

import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export function ExportButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      className="no-print border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
      onClick={() => window.print()}
    >
      <Printer className="mr-1.5 h-3.5 w-3.5" />
      Print / PDF
    </Button>
  );
}
