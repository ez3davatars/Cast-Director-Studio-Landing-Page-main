async function testFakeFunction() {
  const url = "https://wtgkeytabshxtspjoegb.supabase.co/functions/v1/some-made-up-name-that-does-not-exist";
  try {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
    });
    console.log("Status:", res.status);
    console.log("Body:", await res.text());
  } catch (err) {
    console.error(err);
  }
}
testFakeFunction();
