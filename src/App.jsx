import { useEffect, useState } from "react";
import Dashboard from "./pages/Dashboard";
import Auth from "./components/Auth";
import "./styles/global.css";

function App() {
  const [token, setToken] = useState(() => {
    return localStorage.getItem("love_token");
  });

  useEffect(() => {
    const handleAuthChange = () => {
      setToken(localStorage.getItem("love_token"));
    };

    window.addEventListener("love-auth-change", handleAuthChange);

    return () => {
      window.removeEventListener("love-auth-change", handleAuthChange);
    };
  }, []);

  if (!token) {
    return <Auth />;
  }

  return <Dashboard />;
}

export default App;
