# Memory attribution — INCONCLUSIVE

Five warm-up Live/lifecycle journeys, three warm idle samples and six completed measured Live/background/foreground/Exit sessions were preserved. The requested two10-session blocks were interrupted at92%five-hour usage, before block quiet/procstats/heap stages. No leak is established; no leak fix was made.

| Checkpoint | PSS KiB | RSS KiB | Java PSS | Native PSS | Views / roots |
|---|---:|---:|---:|---:|---|
| block1-session01-meminfo.txt | 148699 | 247040 | 19872 | 60068 | 520 / 1 |
| block1-session02-meminfo.txt | 153642 | 251856 | 19752 | 63288 | 520 / 1 |
| block1-session03-meminfo.txt | 157620 | 256108 | 19520 | 66188 | 520 / 1 |
| block1-session04-meminfo.txt | 163484 | 261768 | 19496 | 70420 | 520 / 1 |
| block1-session05-meminfo.txt | 162789 | 261284 | 16336 | 71528 | 519 / 1 |
| block1-session06-meminfo.txt | 175345 | 273840 | 19320 | 79424 | 520 / 1 |
| warm-0-meminfo.txt | 136135 | 233552 | 14384 | 53680 | 519 / 1 |
| warm-1-meminfo.txt | 134995 | 233108 | 14168 | 52940 | 519 / 1 |
| warm-2-meminfo.txt | 134847 | 232960 | 13976 | 52940 | 519 / 1 |

Raw meminfo includes private dirty, heap allocation, graphics and object counters; native registration snapshots and every Exit/foreground XML are preserved. No Release JS watcher/timer/subscription/session counters or retained-reference chains were obtained. GMS aggregation is not an SDK watcher count. Release security was not changed. MEMORY_ATTRIBUTION.json contains exact measurements and limitations. Resume with a fresh comparable two-block experiment; do not append unlike samples or claim these six sessions are20.
