export function getCurrentFantasyYear() {
	const now = new Date();
	// second half of the year (Jul-Dec) belongs to next year's fantasy season
	return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}
