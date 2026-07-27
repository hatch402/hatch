import { ImageResponse } from "next/og";
import { coverage, compact } from "../lib/coverage";

/**
 * The share card. Rendered from the same snapshot the site reads, so the
 * number on the card is the number on the page — when the daily data commit
 * lands, the card moves with it. A hand-drawn PNG would drift stale in a week.
 */

export const alt = "HATCH — liquidation coverage on Robinhood Chain";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PAPER = "#FBFAF7";
const INK = "#14161A";
const GRAPHITE = "#6B6E76";
const RULE = "#C9C5B9";
const AMBER = "#EA8C00";

export default function OpenGraphImage() {
  const c = coverage;
  const ratio = Math.round(c.bridged_ratio);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: PAPER,
          padding: "56px 72px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Plate header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, letterSpacing: 6 }}>
            <span style={{ color: INK }}>HATCH</span>
            <span style={{ color: AMBER }}>402</span>
          </div>
          <div style={{ display: "flex", fontSize: 20, color: GRAPHITE, letterSpacing: 4 }}>
            ROBINHOOD CHAIN · BLOCK {c.pool_block}
          </div>
        </div>

        {/* The reading, with the door drawn beside it */}
        <div style={{ display: "flex", flex: 1, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div
              style={{
                display: "flex",
                fontSize: 210,
                fontWeight: 800,
                color: INK,
                lineHeight: 1,
                letterSpacing: -6,
              }}
            >
              {ratio} : 1
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 30,
                color: GRAPHITE,
                marginTop: 18,
              }}
            >
              dollars waiting per dollar that can leave
            </div>
          </div>

          {/* The wall: one slit, drawn to the measured share */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              width: 120,
              height: 360,
            }}
          >
            <div style={{ display: "flex", width: 4, flex: 60, background: RULE }} />
            <div
              style={{
                display: "flex",
                width: 10,
                height: 12,
                background: AMBER,
                borderRadius: 3,
                boxShadow: `0 0 24px ${AMBER}`,
              }}
            />
            <div style={{ display: "flex", width: 4, flex: 40, background: RULE }} />
          </div>
        </div>

        {/* Footer figures */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            borderTop: `2px solid ${RULE}`,
            paddingTop: 28,
          }}
        >
          <div style={{ display: "flex", fontSize: 26, color: INK, letterSpacing: 3 }}>
            {compact(c.bridged_collateral_usd)} WANTS OUT
          </div>
          <div style={{ display: "flex", fontSize: 26, color: AMBER, letterSpacing: 3, fontWeight: 700 }}>
            {compact(c.bridged_exit_usd)} FITS
          </div>
        </div>
      </div>
    ),
    size,
  );
}
