declare var $: any;  // for jQuery
const FLAG = "FLAG{can_you_alert_this?}";

module app {

    // thank you Kenkoooo for nice API! https://github.com/kenkoooo/AtCoderProblems
    class KenkooooAPI {
        private contestsCache: object[] | undefined;
        private resultsCache: { [index: string]: object[] };

        constructor() {
            this.resultsCache = {};
        }

        public getContests(): object[] {
            if (! this.contestsCache) throw new Error();
            return this.contestsCache;
        }

        public getContestsAsDictionary(): { [index: string]: object } {
            const contests = this.getContests() as any[];
            const f = {} as { [index: string]: object };
            for (const contest of contests) {
                f[contest["id"]] = contest;
            }
            return f;
        }

        public getResults(id: string): object[] {
            if (! this.resultsCache[id]) throw new Error();
            return this.resultsCache[id];
        }

        private fetch(url: string, callback: any) {
            const xhr = new XMLHttpRequest();
            xhr.addEventListener("load", () => {
                console.log(xhr);
                callback(JSON.parse(xhr.responseText));
            });
            xhr.open("GET", url);
            xhr.send();
        }

        public prepareContests(callback: () => any) {
            if (this.contestsCache) return callback();
            const url = "https://kenkoooo.com/atcoder/atcoder-api/info/contests";
            this.fetch(url, (contests: object[]) => {
                this.contestsCache = contests;
                callback();
            });
        }

        // this is required to speed up the response
        public prepareResultsAtOnce(ids: string[], callback: () => any) {
            let cached = true;
            for (const id of ids) {
                if (! this.resultsCache[id]) {
                    cached = false;
                    break;
                }
            }
            if (cached) return callback();

            const url = "https://kenkoooo.com/atcoder/atcoder-api/results?rivals=" + encodeURIComponent(ids.join(","));
            this.fetch(url, (submissions: object[]) => {
                for (const id of ids) {
                    this.resultsCache[id] = [];
                }
                for (const submission of submissions) {
                    this.resultsCache[(submission as any)["user_id"]].push(submission);
                }
                callback();
            });
        }
    }

    function splitToWords(s: string): string[] {
        return s.replace(/,+/g, " ").trim().split(/ +/);  // use spaces and commas as separators
    }

    function getDifferenceOfDates(future: Date, past: Date): number {
        return Math.floor((future.getTime() - past.getTime()) / (1000 * 60 * 60 * 24));
    }

    interface Config {
        [index: string]: any;
        users: string[];
        duration: number;
        score: string;
        average: string;
    }

    export class App {
        private api: KenkooooAPI;
        private usersInput: HTMLInputElement;
        private durationInput: HTMLInputElement;
        private scoreInput: HTMLInputElement;
        private averageInput: HTMLInputElement;
        private goButton: HTMLInputElement;
        private configDetails: HTMLDetailsElement;
        private chart: any;

        constructor() {
            this.api = new KenkooooAPI();
            this.usersInput = <HTMLInputElement> document.getElementById("usersInput");
            this.durationInput = <HTMLInputElement> document.getElementById("durationInput");
            this.scoreInput = <HTMLInputElement> document.getElementById("scoreInput");
            this.averageInput = <HTMLInputElement> document.getElementById("averageInput");
            this.goButton = <HTMLInputElement> document.getElementById("goButton");
            this.configDetails = <HTMLDetailsElement> document.getElementById("configDetails");

            this.loadParams();
            const callback = () => {
                setTimeout(() => {
                    this.storeParams();
                    this.plotGraph();
                }, 0);
            };
            this.goButton.addEventListener("click", callback);

            // plot without any mouse click, if possible
            const config = this.getConfig();
            const defaultConfig = this.getDefaultConfig();  
            if (config["score"] == defaultConfig["score"]
                    && config["average"] == defaultConfig["average"]) {  // NOTE: this confirmation is required to prevent XSS
                callback();
            }
        }

        private loadParams() {
            const params = (new URL(location.href)).searchParams;

            let value = params.get("users");
            if (value) {
                this.usersInput.value = value;
            }

            value = params.get("duration");
            if (value) {
                this.durationInput.value = value;
                this.configDetails.open = true;
            }

            value = params.get("score");
            if (value) {
                this.scoreInput.value = value;
                this.configDetails.open = true;  // NOTE: this is as an alert for XSS
            }

            value = params.get("average");
            if (value) {
                this.averageInput.value = value;
                this.configDetails.open = true;
            }
        }

        private getDefaultConfig(): Config {
            return {
                "users": splitToWords(this.usersInput.placeholder),
                "duration": parseInt(this.durationInput.placeholder),
                "score": this.scoreInput.placeholder,
                "average": this.averageInput.placeholder,
            };
        }

        private getConfig(): Config {
            const data = this.getDefaultConfig();

            if (this.usersInput.value) {
                data["users"] = splitToWords(this.usersInput.value);
            }

            if (parseInt(this.durationInput.value)) {
                data["duration"] = parseInt(this.durationInput.value);
            }

            if (this.scoreInput.value) {
                data["score"] = this.scoreInput.value;
            }

            if (this.averageInput.value) {
                data["average"] = this.averageInput.value;
            }

            return data;
        }

        private storeParams() {
            const config = this.getConfig();
            const defaultConfig = this.getDefaultConfig();  
            const params = (new URL(location.href)).searchParams;

            for (const key of [ "users", "duration", "score", "average" ]) {
                if (JSON.stringify(config[key]) == JSON.stringify(defaultConfig[key])) {
                    params.delete(key);
                } else {
                    if (key == "users") {
                        params.set(key, config[key].join(" "));
                    } else {
                        params.set(key, config[key].toString());
                    }
                }
            }

            window.history.replaceState(null, "", location.pathname + "?" + params);
        }

        private getXAxis(): Date[] {
            const config = this.getConfig();
            const now = new Date();
            const xAxis = [] as Date[];
            for (let i = config["duration"] - 1; i >= 0; -- i) {
                xAxis.push(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i));  // NOTE: non-positive date is adjusted
            }
            return xAxis;
        }

        private makeSeries(): object[] {
            const config = this.getConfig();
            const scoreFunc = new Function("score", "isRated", "return " + config["score"]);
            const averageFunc = new Function("delta", "return " + config["average"]);

            const now = new Date();
            const xAxis = this.getXAxis();
            const contests = this.api.getContestsAsDictionary();

            const series = [] as object[];

            for (const id of config["users"]) {
                const rawSubmissions = this.api.getResults(id) as any[];
                const submissions = [];
                const solved = new Set();
                for (const submission of rawSubmissions) {
                    if (submission["result"] != "AC") continue;
                    const date = new Date(submission["epoch_second"] * 1000);
                    const delta = getDifferenceOfDates(now, date);
                    if (delta > 365) continue;
                    const contestId = submission["contest_id"];
                    if (solved.has(contestId)) continue;
                    solved.add(contestId);
                    const point = parseFloat(submission["point"]);
                    const isRated = (contests[submission["contest_id"]] as any)["rate_change"] != "×";
                    submissions.push([ date, scoreFunc(point, isRated) ]);
                }
                const data = [];
                for (const x of xAxis) {
                    let y = 0;
                    for (const it of submissions) {
                        if (it[0] < x) {
                            y += averageFunc(getDifferenceOfDates(x, it[0])) * it[1];
                        }
                    }
                    data.push([ x, Math.round(y * 100) / 100 ]);
                }
                series.push({
                    "name": id,
                    "data": data,
                });
                console.log(series[series.length - 1]);
            }
            return series;
        }

        private plotGraph() {
            const config = this.getConfig();
            const xAxis = this.getXAxis();
            this.api.prepareContests(() => {
                this.api.prepareResultsAtOnce(config["users"], () => {
                    this.chart = Highcharts.chart("chartContainer", {
                        chart: { type: "spline" },
                        title: { text: null },
                        credits: { enabled: false },
                        xAxis: {
                            type: "datetime",
                            title: { text: null },
                            labels: {
                                formatter: function () {
                                    return Highcharts.dateFormat("%e. %b", xAxis[this.value].getTime());
                                },
                            },
                        },
                        yAxis: {
                            title: { text: null },
                            min: 0,
                        },
                        tooltip: {
                            headerFormat: "",
                            shared: true,
                            crosshairs: true,
                        },
                        plotOptions: {
                            spline: {
                                marker: { enabled: true },
                            }
                        },
                        series: this.makeSeries(),
                    } as Highcharts.Options);
                });
            });
        }
    }
}

window.onload = () => {
    $('.question.circle.icon').popup();
    new app.App();
};
