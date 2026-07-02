import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconSort, IconChevronDown, IconArrowDown, IconCheck } from "./icons.jsx";
import "./sort.css";

const OPTIONS = [
  { key: "date", label: "Date" },
  { key: "name", label: "Name" },
  { key: "size", label: "Size" },
  { key: "type", label: "Type" },
];

// Sort field dropdown + an asc/desc toggle. Calls onChange(sortKey, order).
export default function SortControl({ sort, order, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const current = OPTIONS.find((o) => o.key === sort) || OPTIONS[0];

  return (
    <div className="sort-control" ref={ref}>
      <div className="sort-menu-wrap">
        <button className="btn sort-trigger" onClick={() => setOpen((v) => !v)}>
          <IconSort width={16} height={16} />
          <span>Sort: {current.label}</span>
          <IconChevronDown
            width={15}
            height={15}
            className={`sort-caret ${open ? "up" : ""}`}
          />
        </button>
        <AnimatePresence>
          {open && (
            <motion.ul
              className="sort-menu glass"
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.16 }}
            >
              {OPTIONS.map((o) => (
                <li key={o.key}>
                  <button
                    className={`sort-item ${o.key === sort ? "active" : ""}`}
                    onClick={() => {
                      onChange(o.key, order);
                      setOpen(false);
                    }}
                  >
                    {o.label}
                    {o.key === sort && <IconCheck width={15} height={15} />}
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>

      <button
        className="btn sort-order"
        title={order === "asc" ? "Ascending" : "Descending"}
        onClick={() => onChange(sort, order === "asc" ? "desc" : "asc")}
      >
        <IconArrowDown
          width={16}
          height={16}
          style={{
            transform: order === "asc" ? "rotate(180deg)" : "none",
            transition: "transform 0.2s ease",
          }}
        />
      </button>
    </div>
  );
}
