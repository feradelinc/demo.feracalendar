import React from "react";
const paths = {
  calendar: "M4 5h16v16H4z M4 10h16 M8 3v5 M16 3v5 M8 14h2 M14 14h2",
  connect: "M8 16l8-8 M8 8h8v8",
  play: "M7 4l14 8-14 8z",
  share: "M4 4h16v16H4z M10 4v16 M14 10h3 M14 14h3",
  person: "M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M5 21v-4a7 7 0 0 1 14 0v4",
  box: "M4 7l8-4 8 4v10l-8 4-8-4z M4 7l8 4 8-4 M12 11v10",
  mail: "M3 5h18v14H3z M3 5l9 7 9-7",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l4 2",
  history: "M4 7a9 9 0 1 1-1 8 M4 3v5h5 M12 7v5l4 2",
  code: "M8 7l-5 5 5 5 M16 7l5 5-5 5 M14 4l-4 16",
  sync: "M4 7h16l-4-4 M20 17H4l4 4",
  book: "M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3z M12 6v16",
};
export default function Icon({ name }) {
  return (
    <svg
      aria-hidden="true"
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
