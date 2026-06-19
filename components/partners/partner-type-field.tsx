"use client";

import { useState } from "react";
import { partnerTypes } from "@/lib/constants/partners";
import type { PartnerType } from "@/lib/types/partners";

type PartnerTypeFieldProps = {
  disabled?: boolean;
  defaultCustomType?: string | null;
  defaultType?: PartnerType | null;
};

const inputClass =
  "mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20 disabled:bg-neutral-100 disabled:text-neutral-500";
const selectClass =
  "mt-2 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20 disabled:bg-neutral-100 disabled:text-neutral-500";

export function PartnerTypeField({
  disabled = false,
  defaultCustomType,
  defaultType
}: PartnerTypeFieldProps) {
  const [partnerType, setPartnerType] = useState(defaultType ?? "");
  const isOther = partnerType === "Other";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="block">
        <span className="text-sm font-medium text-neutral-800">
          Partner type
        </span>
        <select
          required
          disabled={disabled}
          name="partner_type"
          value={partnerType}
          onChange={(event) => setPartnerType(event.target.value)}
          className={selectClass}
        >
          <option value="">Select type</option>
          {partnerTypes.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      {isOther ? (
        <label className="block">
          <span className="text-sm font-medium text-neutral-800">
            Specify partner type
          </span>
          <input
            required
            disabled={disabled}
            name="custom_partner_type"
            defaultValue={defaultCustomType ?? ""}
            className={inputClass}
            placeholder="Enter partner type"
          />
        </label>
      ) : (
        <input type="hidden" name="custom_partner_type" value="" />
      )}
    </div>
  );
}
