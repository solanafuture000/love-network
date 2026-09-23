import { useState } from "react";

function BottomNavigation() {
  const [activeItem, setActiveItem] = useState("Home");

  const items = [
    { icon: "⌂", label: "Home", target: "top" },
    { icon: "M", label: "Mining", target: "mining" },
    { icon: "W", label: "Wallet", target: "wallet" },
    { icon: "N", label: "Network", target: "referral" },
    { icon: "P", label: "Profile", target: "profile" },
  ];

  const handleNavigation = (item) => {
    setActiveItem(item.label);

    if (item.target === "top") {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
      return;
    }

    const section = document.getElementById(item.target);

    if (section) {
      section.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  return (
    <nav className="bottom-navigation">
      {items.map((item) => (
        <button
          type="button"
          key={item.label}
          className={activeItem === item.label ? "active" : ""}
          onClick={() => handleNavigation(item)}
        >
          <span className="nav-icon">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export default BottomNavigation;
