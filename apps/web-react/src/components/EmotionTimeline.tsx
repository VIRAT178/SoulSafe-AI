import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Dot,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

export type EmotionTimelinePoint = {
  date: string;
  sentimentScore: number;
  emotion: string;
  capsuleTitle: string;
};

type RangeFilter = "week" | "month" | "year";

type EmotionTimelineProps = {
  data: EmotionTimelinePoint[];
};

function filterByRange(data: EmotionTimelinePoint[], range: RangeFilter): EmotionTimelinePoint[] {
  const now = Date.now();
  const spanMs = range === "week"
    ? 7 * 24 * 60 * 60 * 1000
    : range === "month"
      ? 30 * 24 * 60 * 60 * 1000
      : 365 * 24 * 60 * 60 * 1000;

  return data.filter((point) => Date.parse(point.date) >= now - spanMs);
}

function PeakDot(props: {
  cx?: number;
  cy?: number;
  payload?: EmotionTimelinePoint;
  value?: number;
  max?: number;
}): JSX.Element | null {
  const { cx, cy, value, max } = props;
  if (typeof cx !== "number" || typeof cy !== "number" || typeof value !== "number" || typeof max !== "number") {
    return null;
  }

  if (value < max) {
    return <Dot cx={cx} cy={cy} r={3} fill="#0ea5e9" stroke="none" />;
  }

  return <Dot cx={cx} cy={cy} r={6} fill="#f97316" stroke="#fff" strokeWidth={2} />;
}

export default function EmotionTimeline({ data }: EmotionTimelineProps) {
  const [range, setRange] = useState<RangeFilter>("month");

  const filteredData = useMemo(() => {
    return filterByRange(data, range).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  }, [data, range]);

  const maxSentiment = useMemo(() => {
    if (!filteredData.length) {
      return 0;
    }

    return Math.max(...filteredData.map((point) => point.sentimentScore));
  }, [filteredData]);

  const chartData = useMemo(() => {
    return filteredData.map((point) => ({
      ...point,
      label: new Date(point.date).toLocaleDateString()
    }));
  }, [filteredData]);

  return (
    <article className="ai-card ai-trend-card emotion-journey-card">
      <div className="ai-card-head">
        <h4>Your Emotional Journey</h4>
        <div className="emotion-range-controls" role="group" aria-label="Timeline range">
          {(["week", "month", "year"] as RangeFilter[]).map((item) => (
            <button
              key={item}
              type="button"
              className={range === item ? "inline-btn active" : "inline-btn"}
              onClick={() => setRange(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {!chartData.length ? (
        <p className="capsule-analysis-note">No analyzed capsules in the selected range.</p>
      ) : (
        <div className="emotion-timeline-chart-wrap">
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 8, right: 18, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.35)" />
              <XAxis dataKey="label" minTickGap={22} tick={{ fontSize: 12 }} />
              <YAxis domain={[-1, 1]} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value: number, _name: string, _item: unknown) => [value.toFixed(2), "sentiment"]}
                labelFormatter={(_label: string | number, rows: Array<{ payload?: EmotionTimelinePoint }> | undefined) => {
                  const row = rows?.[0]?.payload;
                  if (!row) {
                    return "";
                  }
                  return `${row.capsuleTitle} - ${row.emotion}`;
                }}
              />
              <Line
                type="monotone"
                dataKey="sentimentScore"
                stroke="#0ea5e9"
                strokeWidth={3}
                dot={(props: { cx?: number; cy?: number; payload?: EmotionTimelinePoint; value?: number }) => (
                  <PeakDot {...props} max={maxSentiment} />
                )}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}
