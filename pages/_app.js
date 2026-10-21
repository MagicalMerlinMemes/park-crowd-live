import Head from "next/head";
import "leaflet/dist/leaflet.css";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Park Crowd Live</title>
        <meta
          name="description"
          key="description"
          content="Live Disneyland and Disney California Adventure wait times, rated against each ride's own history."
        />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
