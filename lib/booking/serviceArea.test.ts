import { describe, it, expect } from "vitest";
import { SUPPORTED_ZIP_CODES, isValidZipFormat, isZipSupported, getCityForZip, EXAMPLE_SUPPORTED_ZIP } from "./serviceArea";

describe("serviceArea — existing supported ZIPs remain supported", () => {
  const existingZips = [
    "07302",
    "07304",
    "07305",
    "07306",
    "07307",
    "07310", // Jersey City
    "07030", // Hoboken
    "07002", // Bayonne
    "07029", // Harrison
    "07102",
    "07103",
    "07104",
    "07105",
    "07106",
    "07107",
    "07108",
    "07112", // Newark
  ];

  it.each(existingZips)("still supports %s", (zip) => {
    expect(isZipSupported(zip)).toBe(true);
  });
});

describe("serviceArea — Hudson-Bergen Light Rail corridor expansion", () => {
  const newCorridorZips: Array<{ zip: string; city: string }> = [
    { zip: "07086", city: "Weehawken" },
    { zip: "07087", city: "Union City" },
    { zip: "07093", city: "West New York" },
    { zip: "07047", city: "North Bergen" },
  ];

  it.each(newCorridorZips)("supports the newly added $city ZIP ($zip)", ({ zip, city }) => {
    expect(isZipSupported(zip)).toBe(true);
    expect(getCityForZip(zip)).toBe(city);
  });

  it("includes each new ZIP exactly once in SUPPORTED_ZIP_CODES", () => {
    for (const { zip } of newCorridorZips) {
      const matches = SUPPORTED_ZIP_CODES.filter((entry) => entry.zip === zip);
      expect(matches.length).toBe(1);
    }
  });
});

describe("serviceArea — clearly unsupported ZIPs continue to fail", () => {
  const unsupportedZips = [
    "10001", // Manhattan, NY — different state entirely
    "07458", // Ramsey, NJ — far northern NJ, well outside the corridor
    "08540", // Princeton, NJ — central NJ, nowhere near Hudson County
    "07601", // Hackensack, NJ — Bergen County, not on the HBLR line
    "99999", // not a real ZIP at all
  ];

  it.each(unsupportedZips)("still rejects %s", (zip) => {
    expect(isZipSupported(zip)).toBe(false);
    expect(getCityForZip(zip)).toBeNull();
  });
});

describe("serviceArea — format validation is unaffected", () => {
  it("accepts a well-formed 5-digit ZIP regardless of support", () => {
    expect(isValidZipFormat("07086")).toBe(true);
    expect(isValidZipFormat("99999")).toBe(true);
  });

  it("rejects malformed ZIP input", () => {
    expect(isValidZipFormat("")).toBe(false);
    expect(isValidZipFormat("ABCDE")).toBe(false);
    expect(isValidZipFormat("1234")).toBe(false);
    expect(isValidZipFormat("123456")).toBe(false);
  });
});

describe("serviceArea — no duplicate ZIPs and stable example", () => {
  it("has no duplicate ZIP codes across the entire supported list", () => {
    const zips = SUPPORTED_ZIP_CODES.map((entry) => entry.zip);
    expect(new Set(zips).size).toBe(zips.length);
  });

  it("EXAMPLE_SUPPORTED_ZIP is still the Hoboken ZIP, unaffected by the expansion", () => {
    expect(EXAMPLE_SUPPORTED_ZIP).toBe("07030");
  });
});
