#!/usr/bin/env bash
# Windows CLI interoperability for the explicitly approved WSL recovery workstation.
operix_workstation_docker() {
  local binary=$1; shift
  local args=("$@") i mount source
  for ((i=0; i<${#args[@]}; i++)); do
    if [[ ${args[i]} == --mount ]]; then
      mount=${args[i+1]}
      source=${mount#*src=}; source=${source%%,*}
      args[i+1]=${mount/"src=$source"/"src=$(wslpath -w "$source")"}
    fi
  done
  # Never normalize Docker stdout: pg_dump's binary archive can contain CR bytes.
  "$binary" --context desktop-linux "${args[@]}"
}
operix_workstation_aws() {
  local binary=$1; shift
  local args=("$@") i
  for ((i=0; i<${#args[@]}; i++)); do
    if [[ ${args[i]} == --body ]]; then args[i+1]=$(wslpath -w "${args[i+1]}"); fi
  done
  if [[ ${args[0]} == s3api && ${args[1]} == get-object ]]; then
    i=$((${#args[@]}-1)); args[i]=$(wslpath -w "${args[i]}")
  fi
  # AWS writes downloaded binary bytes straight to the output file. Stdout is JSON/text.
  "$binary" --profile operix-staging "${args[@]}" | tr -d '\r'
}
