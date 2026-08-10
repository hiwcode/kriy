"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Plus, Search, File, FileText, FileCode2, FileJson2,
  FileTerminal, FileCog, FileImage, FileType2,
  Folder, FolderOpen, FolderPlus, FilePlus, FolderCode,
  ChevronRight, ChevronDown, MoreHorizontal, Pencil, Trash2,
  Loader2, Save, Eye, Wrench, Upload, X, Circle,
  Download, Package, GraduationCap,
} from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { MarkdownPreview } from "@/components/md-preview";
import { listSkills, createSkill, updateSkill, deleteSkill, SkillItem } from "@/lib/api/skills";
import { getSkillTree, getSkillFile, createSkillFile, updateSkillFile, deleteSkillFile, uploadSkillFiles, installSkillFromUrl, SkillFileItem, SkillTreeData } from "@/lib/api/skill-files";
import { createSkillFolder, deleteSkillFolder, updateSkillFolder } from "@/lib/api/skill-folders";
import { getBuiltinTools } from "@/lib/api/agents";
import { listMcpConnections, listMcpConnectionTools, McpToolInfo } from "@/lib/api/mcp-connections";
import { listDatabaseConnections } from "@/lib/api/database-connections";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>,
});

/* ================================================================== */
/* File extension mapping                                              */
/* ================================================================== */

const EXT_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  py:{icon:FileCode2,color:"text-[#3572A5]"},js:{icon:FileCode2,color:"text-[#f0db4f]"},ts:{icon:FileCode2,color:"text-[#3178c6]"},tsx:{icon:FileCode2,color:"text-[#3178c6]"},jsx:{icon:FileCode2,color:"text-[#f0db4f]"},
  sh:{icon:FileTerminal,color:"text-[#4eaa25]"},bash:{icon:FileTerminal,color:"text-[#4eaa25]"},zsh:{icon:FileTerminal,color:"text-[#4eaa25]"},
  rb:{icon:FileCode2,color:"text-[#CC342D]"},go:{icon:FileCode2,color:"text-[#00ADD8]"},rs:{icon:FileCode2,color:"text-[#DEA584]"},java:{icon:FileCode2,color:"text-[#b07219]"},sql:{icon:FileCode2,color:"text-[#e38c00]"},
  c:{icon:FileCode2,color:"text-[#555555]"},cpp:{icon:FileCode2,color:"text-[#f34b7d]"},h:{icon:FileCode2,color:"text-[#555555]"},cs:{icon:FileCode2,color:"text-[#178600]"},swift:{icon:FileCode2,color:"text-[#F05138]"},kt:{icon:FileCode2,color:"text-[#A97BFF]"},
  md:{icon:FileText,color:"text-[#519aba]"},mdx:{icon:FileText,color:"text-[#519aba]"},
  json:{icon:FileJson2,color:"text-[#cbcb41]"},yaml:{icon:FileCog,color:"text-[#cb171e]"},yml:{icon:FileCog,color:"text-[#cb171e]"},toml:{icon:FileCog,color:"text-[#9c4121]"},xml:{icon:FileCode2,color:"text-[#e37933]"},
  ini:{icon:FileCog,color:"text-muted-foreground"},cfg:{icon:FileCog,color:"text-muted-foreground"},conf:{icon:FileCog,color:"text-muted-foreground"},env:{icon:FileCog,color:"text-[#ECD53F]"},
  html:{icon:FileCode2,color:"text-[#e34c26]"},css:{icon:FileCode2,color:"text-[#563d7c]"},scss:{icon:FileCode2,color:"text-[#c6538c]"},svg:{icon:FileImage,color:"text-[#FFB13B]"},
  png:{icon:FileImage,color:"text-[#a074c4]"},jpg:{icon:FileImage,color:"text-[#a074c4]"},jpeg:{icon:FileImage,color:"text-[#a074c4]"},gif:{icon:FileImage,color:"text-[#a074c4]"},
  txt:{icon:FileType2,color:"text-muted-foreground"},log:{icon:FileType2,color:"text-muted-foreground"},
  dockerfile:{icon:FileCode2,color:"text-[#384d54]"},makefile:{icon:FileTerminal,color:"text-[#427819]"},license:{icon:FileText,color:"text-[#d4aa00]"},
};
const EXT_LANG: Record<string, string> = {py:"python",js:"javascript",ts:"typescript",tsx:"typescript",jsx:"javascript",sh:"shell",bash:"shell",zsh:"shell",rb:"ruby",go:"go",rs:"rust",java:"java",sql:"sql",c:"c",cpp:"cpp",h:"c",cs:"csharp",swift:"swift",kt:"kotlin",md:"markdown",mdx:"markdown",json:"json",yaml:"yaml",yml:"yaml",toml:"toml",xml:"xml",html:"html",css:"css",scss:"scss",svg:"xml",ini:"ini",dockerfile:"dockerfile",makefile:"makefile",env:"shell",txt:"plaintext"};

function ext(n: string): string { const l=n.toLowerCase(); if(l==="dockerfile")return"dockerfile"; if(l==="makefile")return"makefile"; if(l==="license"||l==="license.md")return"license"; const d=l.lastIndexOf("."); return d>=0?l.slice(d+1):""; }
function fIcon(n: string, s="size-4") { const e=ext(n); const m=EXT_ICONS[e]; if(m){const I=m.icon;return<I className={`${s} ${m.color} shrink-0`}/>;} return<File className={`${s} text-muted-foreground shrink-0`}/>; }
function fLang(n: string, c?: string): string { const e=ext(n); if(EXT_LANG[e])return EXT_LANG[e]; if(c?.startsWith("#!/bin/bash")||c?.startsWith("#!/bin/sh"))return"shell"; if(c?.startsWith("#!/usr/bin/env python"))return"python"; return"plaintext"; }
function isMd(n: string): boolean { const e=ext(n); return e==="md"||e==="mdx"||e==="markdown"; }

/* ================================================================== */
/* Types                                                               */
/* ================================================================== */

interface Tab { type:"skill"|"file"; id:number; skillId:number; name:string; dirty:boolean }
type MenuItem = {label:string;icon:React.ElementType;action:()=>void;destructive?:boolean} | "sep";

/* ================================================================== */
/* Page                                                                */
/* ================================================================== */

export default function SkillsPage() {
  const searchParams = useSearchParams();
  const [skills,setSkills] = React.useState<SkillItem[]>([]);
  const [loadingSkills,setLoadingSkills] = React.useState(true);
  const [search,setSearch] = React.useState("");
  const [searchVis,setSearchVis] = React.useState(false);
  const [expSkills,setExpSkills] = React.useState<Set<number>>(new Set());
  const [trees,setTrees] = React.useState<Record<number,SkillTreeData>>({});
  const [loadingTree,setLoadingTree] = React.useState<Set<number>>(new Set());
  const [expFolders,setExpFolders] = React.useState<Set<string>>(new Set());
  const [tabs,setTabs] = React.useState<Tab[]>([]);
  const [aTab,setATab] = React.useState<string|null>(null);
  const [selFile,setSelFile] = React.useState<SkillFileItem|null>(null);
  const [selSkill,setSelSkill] = React.useState<SkillItem|null>(null);
  const [content,setContent] = React.useState("");
  const [loadingC,setLoadingC] = React.useState(false);
  const [saving,setSaving] = React.useState(false);
  const [mode,setMode] = React.useState<"edit"|"preview">("edit");
  const [dark,setDark] = React.useState(false);
  const [uploading,setUploading] = React.useState(false);
  const [dragOver,setDragOver] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [dlg,setDlg] = React.useState<{type:"createSkill"}|{type:"createFile";skillId:number;folderId:number|null}|{type:"createFolder";skillId:number;parentId:number|null}|{type:"rename";kind:"skill"|"file"|"folder";id:number;name:string;skillId?:number}|{type:"install"}|null>(null);
  const [dlgName,setDlgName] = React.useState("");
  const [dlgDesc,setDlgDesc] = React.useState("");
  const [dlgUrl,setDlgUrl] = React.useState("");
  const [dlgSkill,setDlgSkill] = React.useState("");
  const [dlgBusy,setDlgBusy] = React.useState(false);
  const [dlgErr,setDlgErr] = React.useState<string|null>(null);
  const [toolsOpen,setToolsOpen] = React.useState(false);
  const [bTools,setBTools] = React.useState<string[]>([]);
  const [mcpC,setMcpC] = React.useState<{id:number;name:string}[]>([]);
  const [dbC,setDbC] = React.useState<{id:number;name:string}[]>([]);
  const [mcpCache,setMcpCache] = React.useState<Record<number,{loading:boolean;tools:McpToolInfo[];error?:string}|undefined>>({});
  const [mcpExp,setMcpExp] = React.useState<number|null>(null);
  const [mcpSel,setMcpSel] = React.useState<Record<number,Set<string>>>({});
  const [sT,setST] = React.useState<Array<{type:string;name?:string;mcp_connection_id?:number;tool_names?:string[];database_connection_id?:number}>>([]);

  React.useEffect(()=>{const c=()=>setDark(document.documentElement.classList.contains("dark"));c();const o=new MutationObserver(c);o.observe(document.documentElement,{attributes:true,attributeFilter:["class"]});return()=>o.disconnect();},[]);

  const tk=(t:Tab)=>`${t.type}-${t.id}`;
  const at=tabs.find(t=>tk(t)===aTab)??null;
  const fetchSkills=React.useCallback(async()=>{setLoadingSkills(true);try{const{items}=await listSkills({limit:200,offset:0});setSkills(items);}catch{}finally{setLoadingSkills(false);}},[]);
  const refreshTree=async(sid:number)=>{try{const t=await getSkillTree(sid);setTrees(p=>({...p,[sid]:t}));}catch{}};

  React.useEffect(()=>{fetchSkills();getBuiltinTools().then(setBTools).catch(()=>{});listMcpConnections({limit:200,offset:0}).then(({items})=>setMcpC(items.map(c=>({id:c.id,name:c.name})))).catch(()=>{});listDatabaseConnections({limit:200,offset:0}).then(({items})=>setDbC(items.map(c=>({id:c.id,name:c.name})))).catch(()=>{});},[fetchSkills]);
  // Opening is driven by URL/skill changes; including the tab callback would
  // retrigger when its tab state changes and reopen a tab the user just closed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(()=>{const s=searchParams.get("selected");if(s&&skills.length){const id=Number(s);if(id)openSkillTab(id);}},[searchParams,skills]);

  const togSkill=async(sid:number)=>{setExpSkills(p=>{const n=new Set(p);if(n.has(sid)){n.delete(sid);}else{n.add(sid);}return n;});if(!trees[sid]&&!loadingTree.has(sid)){setLoadingTree(p=>new Set(p).add(sid));try{const t=await getSkillTree(sid);setTrees(p=>({...p,[sid]:t}));}catch{}finally{setLoadingTree(p=>{const n=new Set(p);n.delete(sid);return n;});}}};
  const togFolder=(k:string)=>setExpFolders(p=>{const n=new Set(p);if(n.has(k)){n.delete(k);}else{n.add(k);}return n;});

  // togSkill is intentionally excluded: it is recreated from live tree-loading
  // state, while this callback already receives fresh values through its deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const openSkillTab=React.useCallback((sid:number)=>{const skill=skills.find(s=>s.id===sid);if(!skill)return;const k=`skill-${sid}`;if(!tabs.find(t=>tk(t)===k))setTabs(p=>[...p,{type:"skill",id:sid,skillId:sid,name:skill.name,dirty:false}]);setATab(k);setSelSkill(skill);setSelFile(null);setST(Array.isArray(skill.tools)?skill.tools:[]);setToolsOpen(false);const tree=trees[sid];const md=tree?.files?.find(f=>f.name==="SKILL.md");setContent(md?.content??skill.instructions??"");setMode("preview");setSelFile(md??null);if(!expSkills.has(sid))togSkill(sid);},[skills,tabs,trees,expSkills]);
  const openFileTab=React.useCallback(async(fid:number,sid:number)=>{const k=`file-${fid}`;setATab(k);setLoadingC(true);try{const f=await getSkillFile(fid);if(!tabs.find(t=>tk(t)===k))setTabs(p=>[...p,{type:"file",id:fid,skillId:sid,name:f.name,dirty:false}]);setSelFile(f);setSelSkill(null);setContent(f.content);setMode(isMd(f.name)?"preview":"edit");setToolsOpen(false);}catch{}finally{setLoadingC(false);}},[tabs]);
  const closeTab=(k:string)=>{setTabs(p=>p.filter(t=>tk(t)!==k));if(aTab===k){const rem=tabs.filter(t=>tk(t)!==k);if(rem.length){const l=rem[rem.length-1];setATab(tk(l));if(l.type==="skill"){openSkillTab(l.id);}else{openFileTab(l.id,l.skillId);}}else{setATab(null);setSelFile(null);setSelSkill(null);}}};
  const markDirty=()=>{if(aTab)setTabs(p=>p.map(t=>tk(t)===aTab?{...t,dirty:true}:t));};

  const handleSave=async()=>{if(!at)return;setSaving(true);try{if(at.type==="file"&&selFile){await updateSkillFile(selFile.id,{content});setSelFile(p=>p?{...p,content}:p);await refreshTree(selFile.skill_id);}else if(at.type==="skill"&&selSkill){if(selFile?.name==="SKILL.md"){await updateSkillFile(selFile.id,{content});setSelFile(p=>p?{...p,content}:p);}await updateSkill(selSkill.id,{tools:sT});await fetchSkills();await refreshTree(selSkill.id);}setTabs(p=>p.map(t=>tk(t)===aTab?{...t,dirty:false}:t));}catch{}finally{setSaving(false);}};
  // The listed editor state is the complete save payload. Depending on the
  // recreated wrapper itself would reinstall the listener on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(()=>{const h=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key==="s"){e.preventDefault();handleSave();}};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[at,content,selFile,selSkill,sT]);

  const handleUpload=async(files:FileList,sid:number,fid?:number|null)=>{setUploading(true);try{for(const f of Array.from(files)){const t=await uploadSkillFiles(sid,f,fid);setTrees(p=>({...p,[sid]:t}));}if(!expSkills.has(sid))togSkill(sid);}catch{}finally{setUploading(false);setDragOver(false);}};
  const handleDrop=(e:React.DragEvent)=>{e.preventDefault();setDragOver(false);if(!e.dataTransfer.files.length)return;const t=[...expSkills][0]??skills[0]?.id;if(t)handleUpload(e.dataTransfer.files,t);};

  const handleDlgSubmit=async()=>{if(!dlg)return;setDlgErr(null);setDlgBusy(true);try{if(dlg.type==="createSkill"){if(!dlgName.trim()){setDlgErr("Name required");setDlgBusy(false);return;}const s=await createSkill({name:dlgName.trim(),description:dlgDesc.trim()||null,instructions:`# ${dlgName.trim()}\n\n${dlgDesc.trim()}`});await fetchSkills();togSkill(s.id);try{const t=await getSkillTree(s.id);setTrees(p=>({...p,[s.id]:t}));}catch{}openSkillTab(s.id);}else if(dlg.type==="createFile"){if(!dlgName.trim()){setDlgErr("Name required");setDlgBusy(false);return;}const f=await createSkillFile({skill_id:dlg.skillId,name:dlgName.trim(),folder_id:dlg.folderId});await refreshTree(dlg.skillId);openFileTab(f.id,dlg.skillId);}else if(dlg.type==="createFolder"){if(!dlgName.trim()){setDlgErr("Name required");setDlgBusy(false);return;}await createSkillFolder({name:dlgName.trim(),skill_id:dlg.skillId,parent_id:dlg.parentId});await refreshTree(dlg.skillId);}else if(dlg.type==="rename"){if(!dlgName.trim()){setDlgErr("Name required");setDlgBusy(false);return;}if(dlg.kind==="skill"){await updateSkill(dlg.id,{name:dlgName.trim()});await fetchSkills();}else if(dlg.kind==="file"){await updateSkillFile(dlg.id,{name:dlgName.trim()});if(dlg.skillId)await refreshTree(dlg.skillId);}else{await updateSkillFolder(dlg.id,{name:dlgName.trim()});if(dlg.skillId)await refreshTree(dlg.skillId);}}else if(dlg.type==="install"){if(!dlgUrl.trim()){setDlgErr("URL required");setDlgBusy(false);return;}const result=await installSkillFromUrl({url:dlgUrl.trim(),name:dlgName.trim()||undefined,skill:dlgSkill.trim()||undefined});await fetchSkills();togSkill(result.id);try{const t=await getSkillTree(result.id);setTrees(p=>({...p,[result.id]:t}));}catch{}openSkillTab(result.id);}setDlg(null);}catch(err){setDlgErr(err instanceof Error?err.message:"Failed");}finally{setDlgBusy(false);}};

  const delSkill=async(id:number)=>{if(!confirm("Delete this skill and all files?"))return;await deleteSkill(id);setTabs(p=>p.filter(t=>!(t.type==="skill"&&t.id===id)));if(at?.type==="skill"&&at.id===id){setATab(null);setSelSkill(null);}await fetchSkills();};
  const delFile=async(fid:number,sid:number)=>{if(!confirm("Delete this file?"))return;await deleteSkillFile(fid);setTabs(p=>p.filter(t=>!(t.type==="file"&&t.id===fid)));if(at?.type==="file"&&at.id===fid){setATab(null);setSelFile(null);}await refreshTree(sid);};
  const delFolder=async(fid:number,sid:number)=>{if(!confirm("Delete this folder?"))return;await deleteSkillFolder(fid);await refreshTree(sid);};

  const isBT=(n:string)=>sT.some(t=>t.type==="builtin"&&t.name===n);
  const togBT=(n:string)=>{setST(p=>p.some(t=>t.type==="builtin"&&t.name===n)?p.filter(t=>!(t.type==="builtin"&&t.name===n)):[...p,{type:"builtin",name:n}]);markDirty();};
  const isDB=(id:number)=>sT.some(t=>t.type==="database"&&Number(t.database_connection_id)===id);
  const togDB=(id:number)=>{setST(p=>p.some(t=>t.type==="database"&&Number(t.database_connection_id)===id)?p.filter(t=>!(t.type==="database"&&Number(t.database_connection_id)===id)):[...p,{type:"database",database_connection_id:id}]);markDirty();};
  const isMC=(c:number)=>sT.some(t=>t.type==="mcp"&&Number(t.mcp_connection_id)===c);
  const togMC=(c:number)=>{if(isMC(c)){setST(p=>p.filter(t=>!(t.type==="mcp"&&Number(t.mcp_connection_id)===c)));}else{setST(p=>[...p,{type:"mcp",mcp_connection_id:c,tool_names:[]}]);if(!mcpCache[c]){setMcpCache(p=>({...p,[c]:{loading:true,tools:[]}}));listMcpConnectionTools(c).then(t=>setMcpCache(p=>({...p,[c]:{loading:false,tools:t}}))).catch(e=>setMcpCache(p=>({...p,[c]:{loading:false,tools:[],error:e?.message}})));}setMcpExp(c);}markDirty();};
  const togMCT=(c:number,n:string)=>{setMcpSel(p=>{const s=new Set(p[c]??[]);if(s.has(n)){s.delete(n);}else{s.add(n);}return{...p,[c]:s};});setST(p=>p.map(t=>{if(t.type!=="mcp"||Number(t.mcp_connection_id)!==c)return t;const s=new Set(t.tool_names??[]);if(s.has(n)){s.delete(n);}else{s.add(n);}return{...t,tool_names:Array.from(s)};}));markDirty();};

  const filtered=search.trim()?skills.filter(s=>s.name.toLowerCase().includes(search.toLowerCase())):skills;

  function renderChildren(tree:SkillTreeData,pid:number|null,sid:number,depth:number):React.ReactNode{
    const folders=tree.folders.filter(f=>f.parent_id===pid);const files=tree.files.filter(f=>f.folder_id===pid);
    return(<>{folders.map(folder=>{const k=`${sid}-${folder.id}`;const open=expFolders.has(k);return(<div key={k}><TreeRow depth={depth} icon={open?<FolderOpen className="size-4 text-muted-foreground shrink-0"/>:<Folder className="size-4 text-muted-foreground shrink-0"/>} label={folder.name} active={false} chevron={open?"down":"right"} onClick={()=>togFolder(k)} menu={[{label:"New File",icon:FilePlus,action:()=>{setDlgName("");setDlg({type:"createFile",skillId:sid,folderId:folder.id});}},{label:"New Folder",icon:FolderPlus,action:()=>{setDlgName("");setDlg({type:"createFolder",skillId:sid,parentId:folder.id});}},  "sep",{label:"Rename",icon:Pencil,action:()=>{setDlgName(folder.name);setDlg({type:"rename",kind:"folder",id:folder.id,name:folder.name,skillId:sid});}},{label:"Delete",icon:Trash2,action:()=>delFolder(folder.id,sid),destructive:true}]}/>{open&&renderChildren(tree,folder.id,sid,depth+1)}</div>);})}{files.map(file=>(<TreeRow key={`f-${file.id}`} depth={depth} icon={fIcon(file.name,"size-4")} label={file.name} active={at?.type==="file"&&at.id===file.id} onClick={()=>openFileTab(file.id,sid)} menu={[{label:"Rename",icon:Pencil,action:()=>{setDlgName(file.name);setDlg({type:"rename",kind:"file",id:file.id,name:file.name,skillId:sid});}},{label:"Delete",icon:Trash2,action:()=>delFile(file.id,sid),destructive:true}]}/>))}</>);
  }

  const lang=selFile?fLang(selFile.name,content):"markdown";

  return(
    <AppLayout className="!overflow-hidden">
      <div className="flex flex-col h-full">
        <div className="flex h-14 shrink-0 items-center justify-between gap-4 border-b px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Package className="size-4" /></span>
            <div className="min-w-0">
              <div className="flex items-center gap-2"><h1 className="font-semibold tracking-tight">Skills workspace</h1><Badge variant="secondary">Beta</Badge></div>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">Build reusable instructions, scripts, and tool bundles.</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={()=>{setDlgUrl("");setDlgName("");setDlgSkill("");setDlgErr(null);setDlg({type:"install"});}}><Download data-icon="inline-start" />Import</Button>
            <Button size="sm" onClick={()=>{setDlgName("");setDlgDesc("");setDlgErr(null);setDlg({type:"createSkill"});}}><Plus data-icon="inline-start" />New skill</Button>
          </div>
        </div>
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          <ResizablePanel defaultSize={240} minSize={100} maxSize={300}>
            <div className="flex flex-col h-full" onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={handleDrop}>
              <div className="flex items-center justify-between px-3 h-9 border-b text-[11px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
                Explorer
                <div className="flex gap-0.5">
                  <Button variant="ghost" size="icon-xs" onClick={()=>setSearchVis(v=>!v)} aria-label="Search skills"><Search /></Button>
                  <Button variant="ghost" size="icon-xs" onClick={()=>fileRef.current?.click()} aria-label="Upload skill files"><Upload /></Button>
                </div>
              </div>
              <input ref={fileRef} type="file" className="hidden" accept=".zip,.py,.js,.ts,.sh,.md,.txt,.json,.yaml,.yml,.toml,.xml,.html,.css,.sql,.go,.rs,.rb,.java,.jsx,.tsx,.scss,.svg,.cfg,.conf,.ini,.env" multiple onChange={e=>{if(!e.target.files?.length)return;const t=[...expSkills][0]??skills[0]?.id;if(t)handleUpload(e.target.files,t);e.target.value="";}}/>
              {searchVis&&<div className="px-2 py-1.5 border-b shrink-0"><Input placeholder="Filter..." value={search} onChange={e=>setSearch(e.target.value)} className="h-6 text-xs" autoFocus/></div>}
              {dragOver&&<div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/5 border-2 border-dashed border-primary/30 rounded-lg pointer-events-none"><p className="text-sm font-medium text-primary">Drop to upload</p></div>}
              {uploading&&<div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground border-b shrink-0"><Loader2 className="size-3 animate-spin"/>Uploading...</div>}
              <div className="flex-1 overflow-auto py-0.5 relative">
                {loadingSkills?<div className="flex justify-center py-12"><Loader2 className="size-4 animate-spin text-muted-foreground"/></div>
                :filtered.length===0?(
                  <div className="text-center py-12 px-4">
                    <FolderCode className="size-8 text-muted-foreground/20 mx-auto mb-2"/>
                    <p className="text-xs text-muted-foreground mb-3">No skills yet</p>
                    <div className="flex flex-col gap-1.5 items-center">
                      <Button size="sm" variant="outline" className="text-xs h-7" onClick={()=>{setDlgName("");setDlgDesc("");setDlgErr(null);setDlg({type:"createSkill"});}}><Plus className="size-3 mr-1"/>New Skill</Button>
                      <Button size="sm" variant="ghost" className="text-xs h-7" onClick={()=>{setDlgUrl("");setDlgName("");setDlgSkill("");setDlgErr(null);setDlg({type:"install"});}}><Download className="size-3 mr-1"/>Import from Git</Button>
                    </div>
                  </div>
                ):filtered.map(skill=>{const open=expSkills.has(skill.id);const tree=trees[skill.id];const loading=loadingTree.has(skill.id);const active=at?.type==="skill"&&at.id===skill.id;return(
                  <div key={skill.id}>
                    <TreeRow depth={0} icon={skill.source==="self-learned"?<GraduationCap className="size-4 text-primary shrink-0"><title>Self-learned</title></GraduationCap>:<Package className="size-4 text-primary shrink-0"/>} label={skill.name} bold active={active} chevron={open?"down":"right"} onChevronClick={()=>togSkill(skill.id)} onClick={()=>{openSkillTab(skill.id);if(!open)togSkill(skill.id);}} menu={[{label:"New File",icon:FilePlus,action:()=>{setDlgName("");setDlg({type:"createFile",skillId:skill.id,folderId:null});}},{label:"New Folder",icon:FolderPlus,action:()=>{setDlgName("");setDlg({type:"createFolder",skillId:skill.id,parentId:null});}},{label:"Upload",icon:Upload,action:()=>{const i=document.createElement("input");i.type="file";i.accept=".zip,.py,.js,.ts,.sh,.md,.txt,.json,.yaml,.yml";i.multiple=true;i.onchange=()=>{if(i.files?.length)handleUpload(i.files,skill.id);};i.click();}},"sep",{label:"Rename",icon:Pencil,action:()=>{setDlgName(skill.name);setDlg({type:"rename",kind:"skill",id:skill.id,name:skill.name});}},{label:"Delete",icon:Trash2,action:()=>delSkill(skill.id),destructive:true}]}/>
                    {open&&(loading?<div className="flex items-center gap-1.5 py-1 pl-8 text-[11px] text-muted-foreground"><Loader2 className="size-3 animate-spin"/>Loading...</div>:tree?renderChildren(tree,null,skill.id,1):null)}
                  </div>
                );})}
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle/>
          <ResizablePanel defaultSize={76} minSize={40}>
            <div className="flex flex-col h-full">
              {tabs.length>0&&(<div className="flex items-center border-b h-[35px] shrink-0 overflow-x-auto">{tabs.map(t=>{const k=tk(t);const active=k===aTab;return(<div role="tab" key={k} className={`flex items-center gap-1.5 px-3 h-full text-[12px] border-r shrink-0 transition-colors cursor-pointer ${active?"bg-background text-foreground border-b-2 border-b-primary":"text-muted-foreground hover:text-foreground hover:bg-background/50"}`} onClick={()=>{setATab(k);if(t.type==="skill"){openSkillTab(t.id);}else{openFileTab(t.id,t.skillId);}}}>{t.type==="skill"?<Package className="size-3 text-primary"/>:fIcon(t.name,"size-3")}<span className="max-w-32 truncate">{t.name}</span>{t.dirty&&<Circle className="size-1.5 fill-current text-primary"/>}<Button variant="ghost" size="icon" className="ml-1 size-5 opacity-60 hover:opacity-100" onClick={e=>{e.stopPropagation();closeTab(k);}}><X className="size-3"/></Button></div>);})}</div>)}
              {!at?(<div className="flex-1 flex items-center justify-center"><div className="text-center max-w-xs"><Package className="size-12 text-muted-foreground/10 mx-auto mb-4"/><p className="text-sm text-muted-foreground mb-1">No file open</p><p className="text-[11px] text-muted-foreground/50 leading-relaxed">Select a skill or file from the explorer. Drag & drop ZIP files, or import from GitHub.</p></div></div>
              ):loadingC?(<div className="flex-1 flex items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground"/></div>
              ):at.type==="skill"&&selSkill?(
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="px-5 py-3 border-b shrink-0 flex items-start justify-between gap-4">
                    <div className="min-w-0"><div className="flex items-center gap-2"><Package className="size-4 text-primary shrink-0"/><h2 className="text-base font-semibold truncate">{selSkill.name}</h2></div>{selSkill.description&&<p className="text-xs text-muted-foreground mt-0.5 ml-6">{selSkill.description}</p>}</div>
                    <div className="flex items-center gap-1.5 shrink-0"><Button variant="ghost" size="sm" className="h-7 text-xs" onClick={()=>setToolsOpen(!toolsOpen)}><Wrench className="size-3 mr-1"/>Tools ({sT.length})</Button><Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}><Save className="size-3 mr-1"/>{saving?"Saving...":"Save"}</Button></div>
                  </div>
                  <div className="flex-1 min-h-0 flex">
                    <div className="flex-1 min-w-0 flex flex-col">
                      <div className="flex items-center gap-1 px-3 h-8 border-b shrink-0"><ModeBtn active={mode==="preview"} onClick={()=>setMode("preview")}><Eye className="size-3"/>Preview</ModeBtn><ModeBtn active={mode==="edit"} onClick={()=>setMode("edit")}><Pencil className="size-3"/>Edit</ModeBtn><span className="text-[10px] text-muted-foreground ml-auto">SKILL.md</span></div>
                      <div className="flex-1 min-h-0">{mode==="preview"?<div className="h-full overflow-auto p-6"><MarkdownPreview content={content||"No content."}/></div>:<MonacoEditor height="100%" language="markdown" theme={dark?"vs-dark":"vs"} value={content} onChange={v=>{setContent(v??"");markDirty();}} options={{minimap:{enabled:false},fontSize:13,lineHeight:22,padding:{top:12,bottom:12},wordWrap:"on",scrollBeyondLastLine:false,renderLineHighlight:"none",lineNumbers:"off",glyphMargin:false,lineDecorationsWidth:12,automaticLayout:true}}/>}</div>
                    </div>
                    {toolsOpen&&<ToolsSidebar bTools={bTools} dbC={dbC} mcpC={mcpC} mcpCache={mcpCache} mcpExp={mcpExp} mcpSel={mcpSel} sT={sT} isBT={isBT} togBT={togBT} isDB={isDB} togDB={togDB} isMC={isMC} togMC={togMC} togMCT={togMCT} setMcpCache={setMcpCache} setMcpExp={setMcpExp}/>}
                  </div>
                </div>
              ):at.type==="file"&&selFile?(
                <div className="flex-1 min-h-0 flex flex-col">
                  {isMd(selFile.name)?<><div className="flex items-center gap-1 px-3 h-8 border-b shrink-0"><ModeBtn active={mode==="edit"} onClick={()=>setMode("edit")}><Pencil className="size-3"/>Edit</ModeBtn><ModeBtn active={mode==="preview"} onClick={()=>setMode("preview")}><Eye className="size-3"/>Preview</ModeBtn><span className="text-[10px] text-muted-foreground ml-auto">{lang}</span><Button size="sm" variant="ghost" className="h-6 text-[10px] ml-1" onClick={handleSave} disabled={saving}><Save className="size-3 mr-1"/>{saving?"...":"Save"}</Button></div><div className="flex-1 min-h-0">{mode==="edit"?<MonacoEditor height="100%" language="markdown" theme={dark?"vs-dark":"vs"} value={content} onChange={v=>{setContent(v??"");markDirty();}} options={{minimap:{enabled:false},fontSize:13,lineHeight:22,padding:{top:12,bottom:12},wordWrap:"on",scrollBeyondLastLine:false,renderLineHighlight:"none",lineNumbers:"off",glyphMargin:false,lineDecorationsWidth:12,automaticLayout:true}}/>:<div className="h-full overflow-auto p-6"><MarkdownPreview content={content||"Empty."}/></div>}</div></>
                  :<><div className="flex items-center gap-2 px-3 h-8 border-b shrink-0">{fIcon(selFile.name,"size-3.5")}<span className="text-[10px] text-muted-foreground uppercase tracking-wider">{lang}</span><span className="flex-1"/><Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={handleSave} disabled={saving}><Save className="size-3 mr-1"/>{saving?"...":"Save"}</Button></div><div className="flex-1 min-h-0"><MonacoEditor height="100%" language={lang} theme={dark?"vs-dark":"vs"} value={content} onChange={v=>{setContent(v??"");markDirty();}} options={{minimap:{enabled:true},fontSize:13,lineHeight:20,padding:{top:8,bottom:8},scrollBeyondLastLine:false,renderLineHighlight:"gutter",automaticLayout:true,tabSize:2}}/></div></>}
                </div>
              ):null}
              <div className="flex items-center justify-between px-3 h-6 border-t text-[10px] text-muted-foreground shrink-0"><span>{at?(at.type==="skill"?`Skill: ${at.name}`:at.name):"Ready"}</span><span>{at&&lang!=="plaintext"?lang:""}</span></div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>

        <Dialog open={dlg!==null} onOpenChange={o=>{if(!o)setDlg(null);}}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{dlg?.type==="createSkill"?"New Skill":dlg?.type==="createFile"?"New File":dlg?.type==="createFolder"?"New Folder":dlg?.type==="install"?"Import Skill from Git":"Rename"}</DialogTitle>
              {dlg?.type==="createSkill"&&<DialogDescription>A SKILL.md file will be auto-created.</DialogDescription>}
              {dlg?.type==="install"&&<DialogDescription>Enter a GitHub URL. If a skill.yaml manifest exists, it will configure the skill automatically.</DialogDescription>}
            </DialogHeader>
            <div className="space-y-3 py-2">
              {dlg?.type==="install"?<><div className="space-y-1.5"><Label className="text-xs">Repository URL</Label><div className="flex items-center gap-2"><Download className="size-4 text-muted-foreground shrink-0"/><Input value={dlgUrl} onChange={e=>setDlgUrl(e.target.value)} placeholder="https://github.com/owner/repo" autoFocus onKeyDown={e=>{if(e.key==="Enter")handleDlgSubmit();}}/></div></div><div className="space-y-1.5"><Label className="text-xs">Skill subdirectory <span className="text-muted-foreground">(for multi-skill repos)</span></Label><Input value={dlgSkill} onChange={e=>setDlgSkill(e.target.value)} placeholder="e.g. frontend-design (leave empty for entire repo)"/></div><div className="space-y-1.5"><Label className="text-xs">Name override <span className="text-muted-foreground">(optional)</span></Label><Input value={dlgName} onChange={e=>setDlgName(e.target.value)} placeholder="Auto-detected from repo"/></div></>
              :<><div className="space-y-1.5"><Label className="text-xs">Name</Label><Input value={dlgName} onChange={e=>setDlgName(e.target.value)} placeholder={dlg?.type==="createFile"?"e.g. setup.sh, README.md":dlg?.type==="createFolder"?"e.g. scripts, assets":"Name..."} autoFocus onKeyDown={e=>{if(e.key==="Enter")handleDlgSubmit();}}/></div>{dlg?.type==="createSkill"&&<div className="space-y-1.5"><Label className="text-xs">Description</Label><Input value={dlgDesc} onChange={e=>setDlgDesc(e.target.value)} placeholder="What this skill does..." onKeyDown={e=>{if(e.key==="Enter")handleDlgSubmit();}}/></div>}</>}
              {dlgErr&&<div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">{dlgErr}</div>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={()=>setDlg(null)} disabled={dlgBusy}>Cancel</Button>
              <Button onClick={handleDlgSubmit} disabled={dlgBusy||(dlg?.type==="install"?!dlgUrl.trim():!dlgName.trim())}>{dlgBusy?<><Loader2 className="size-3 mr-1 animate-spin"/>Working...</>:dlg?.type==="rename"?"Rename":dlg?.type==="install"?<><Download className="size-3 mr-1"/>Import</>:"Create"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

/* ================================================================== */
/* Sub-components                                                      */
/* ================================================================== */

function TreeRow({depth,icon,label,bold,active,chevron,onClick,onChevronClick,menu}:{depth:number;icon:React.ReactNode;label:string;bold?:boolean;active:boolean;chevron?:"right"|"down";onClick:()=>void;onChevronClick?:()=>void;menu?:MenuItem[];}){
  return(<div className={`flex items-center gap-1 h-[26px] pr-1 cursor-pointer group text-[13px] select-none ${active?"bg-accent text-foreground":"hover:bg-accent/40 text-foreground/80"}`} style={{paddingLeft:`${8+depth*16}px`}} onClick={onClick}>
    {chevron?<Button variant="ghost" size="icon" className="size-5 shrink-0" onClick={e=>{e.stopPropagation();(onChevronClick??onClick)();}}>{chevron==="down"?<ChevronDown className="size-3 text-muted-foreground"/>:<ChevronRight className="size-3 text-muted-foreground"/>}</Button>:<span className="w-5 shrink-0"/>}
    <span className="shrink-0">{icon}</span><span className={`truncate flex-1 ${bold?"font-medium":""}`}>{label}</span>
    {menu&&(<DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 size-5 shrink-0" onClick={e=>e.stopPropagation()}><MoreHorizontal className="size-3"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-40">{menu.map((item,i)=>item==="sep"?<DropdownMenuSeparator key={i}/>:<DropdownMenuItem key={i} className={item.destructive?"text-destructive":""} onClick={item.action}><item.icon className="size-3.5 mr-2"/>{item.label}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>)}
  </div>);
}

function ModeBtn({active,onClick,children}:{active:boolean;onClick:()=>void;children:React.ReactNode}){
  return<Button variant="ghost" size="sm" onClick={onClick} className={`h-6 px-2 text-xs ${active?"bg-background text-foreground font-medium shadow-sm":"text-muted-foreground hover:text-foreground"}`}>{children}</Button>;
}

type McpCacheEntry = { loading: boolean; tools: McpToolInfo[]; error?: string } | undefined;
type SelectedTool = { type: string; name?: string; mcp_connection_id?: number; tool_names?: string[]; database_connection_id?: number };

interface ToolsSidebarProps {
  bTools: string[];
  dbC: { id: number; name: string }[];
  mcpC: { id: number; name: string }[];
  mcpCache: Record<number, McpCacheEntry>;
  mcpExp: number | null;
  mcpSel: Record<number, Set<string>>;
  sT: SelectedTool[];
  isBT: (n: string) => boolean;
  togBT: (n: string) => void;
  isDB: (id: number) => boolean;
  togDB: (id: number) => void;
  isMC: (c: number) => boolean;
  togMC: (c: number) => void;
  togMCT: (c: number, n: string) => void;
  setMcpCache: React.Dispatch<React.SetStateAction<Record<number, McpCacheEntry>>>;
  setMcpExp: React.Dispatch<React.SetStateAction<number | null>>;
}

interface ToolSecProps {
  title: string;
  items: string[];
  isChecked?: (n: string) => boolean;
  toggle?: (n: string) => void;
  ids?: number[];
  isCheckedId?: (id: number) => boolean;
  toggleId?: (id: number) => void;
}

function ToolsSidebar({bTools,dbC,mcpC,mcpCache,mcpExp,mcpSel,isBT,togBT,isDB,togDB,isMC,togMC,togMCT,setMcpExp}:ToolsSidebarProps){
  return(<div className="w-60 border-l overflow-auto p-3 space-y-3 shrink-0">
    {bTools.length>0&&<ToolSec title="Builtin" items={bTools} isChecked={isBT} toggle={togBT}/>}
    {dbC.length>0&&<ToolSec title="Databases" items={dbC.map((c)=>c.name)} ids={dbC.map((c)=>c.id)} isCheckedId={isDB} toggleId={togDB}/>}
    {mcpC.length>0&&(<div><p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 font-medium">MCP</p>
      {mcpC.map((c)=>{const en=isMC(c.id);const exp=mcpExp===c.id;const cache=mcpCache[c.id];return(
        <Collapsible key={c.id} open={exp&&en} onOpenChange={o=>setMcpExp(o?c.id:null)}><div className="rounded border px-2 py-1 mb-1"><div className="flex items-center gap-1.5"><Checkbox checked={en} onCheckedChange={()=>togMC(c.id)} className="size-3.5"/><span className="text-xs flex-1 truncate cursor-pointer" onClick={()=>togMC(c.id)}>{c.name}</span>{en&&<CollapsibleTrigger asChild><Button variant="ghost" size="icon" className="size-5">{exp?<ChevronDown className="size-3"/>:<ChevronRight className="size-3"/>}</Button></CollapsibleTrigger>}</div>
        <CollapsibleContent className="pt-1 pl-5 space-y-0.5">{cache?.loading&&<p className="text-[10px] text-muted-foreground"><Loader2 className="size-3 animate-spin inline mr-1"/>Loading...</p>}{cache?.tools?.map((t)=><label key={t.name} className="flex items-center gap-1.5 text-[11px] cursor-pointer"><Checkbox checked={mcpSel[c.id]?.has(t.name)??false} onCheckedChange={()=>togMCT(c.id,t.name)} className="size-3"/><span className="truncate" title={t.description}>{t.name}</span></label>)}</CollapsibleContent></div></Collapsible>);})}</div>)}
  </div>);
}

function ToolSec({title,items,isChecked,toggle,ids,isCheckedId,toggleId}:ToolSecProps){
  if(!items.length)return null;
  return(<div><p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 font-medium">{title}</p>{items.map((name:string,i:number)=>(<label key={name} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-accent/50 rounded px-1.5 py-0.5 -mx-1.5"><Checkbox checked={ids?isCheckedId?.(ids[i])??false:isChecked?.(name)??false} onCheckedChange={()=>ids?toggleId?.(ids[i]):toggle?.(name)} className="size-3.5"/><span className="truncate">{name}</span></label>))}</div>);
}
