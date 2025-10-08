import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Save, RotateCcw, Database, Cloud, Shield, Scale } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Coal density presets (tonnes/m³)
const COAL_DENSITY_PRESETS = {
  anthracite: 1.5,
  bituminous: 1.3,
  subBituminous: 1.2,
  lignite: 1.15,
  peat: 0.9,
  custom: null,
};

type CoalType = keyof typeof COAL_DENSITY_PRESETS;

export default function Settings() {
  const [activeTab, setActiveTab] = useState("general");
  const [densityPreset, setDensityPreset] = useState<CoalType>("bituminous");
  const [customDensity, setCustomDensity] = useState(1.3);
  const [autoBackup, setAutoBackup] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [apiEndpoint, setApiEndpoint] = useState("http://localhost:5001/api");
  const [isLoading, setIsLoading] = useState(false);
  
  const { toast } = useToast();

  const handleSaveSettings = async () => {
    setIsLoading(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    toast({
      title: "Settings saved",
      description: "Your settings have been updated successfully.",
    });
    
    setIsLoading(false);
  };

  const handleDensityPresetChange = (value: CoalType) => {
    setDensityPreset(value);
    if (value !== "custom") {
      setCustomDensity(COAL_DENSITY_PRESETS[value] || 1.3);
    }
  };

  const handleCustomDensityChange = (value: number[]) => {
    setCustomDensity(value[0]);
    setDensityPreset("custom");
  };

  const resetSettings = () => {
    setDensityPreset("bituminous");
    setCustomDensity(1.3);
    setAutoBackup(true);
    setDarkMode(true);
    setApiEndpoint("http://localhost:5001/api");
    
    toast({
      title: "Settings reset",
      description: "All settings have been reset to default values.",
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Configure application preferences and measurement parameters
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="measurement">Measurement</TabsTrigger>
          <TabsTrigger value="storage">Storage & Backup</TabsTrigger>
          <TabsTrigger value="api">API Configuration</TabsTrigger>
        </TabsList>
        
        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>
                Configure application appearance and behavior
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="dark-mode">Dark Mode</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable dark theme for the application
                  </p>
                </div>
                <Switch
                  id="dark-mode"
                  checked={darkMode}
                  onCheckedChange={setDarkMode}
                />
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <Select defaultValue="en">
                  <SelectTrigger id="language">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="de">German</SelectItem>
                    <SelectItem value="zh">Chinese</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="measurement" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scale className="h-5 w-5" />
                Material Density Configuration
              </CardTitle>
              <CardDescription>
                Set default density values for volume to weight conversion
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="coal-type">Coal Type</Label>
                <Select 
                  value={densityPreset} 
                  onValueChange={(value) => handleDensityPresetChange(value as CoalType)}
                >
                  <SelectTrigger id="coal-type">
                    <SelectValue placeholder="Select coal type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anthracite">Anthracite (1.5 t/m³)</SelectItem>
                    <SelectItem value="bituminous">Bituminous (1.3 t/m³)</SelectItem>
                    <SelectItem value="subBituminous">Sub-Bituminous (1.2 t/m³)</SelectItem>
                    <SelectItem value="lignite">Lignite (1.15 t/m³)</SelectItem>
                    <SelectItem value="peat">Peat (0.9 t/m³)</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="density">Custom Density (tonnes/m³)</Label>
                  <span className="text-sm font-medium">{customDensity.toFixed(2)}</span>
                </div>
                <Slider
                  id="density"
                  min={0.5}
                  max={2.5}
                  step={0.05}
                  value={[customDensity]}
                  onValueChange={handleCustomDensityChange}
                  disabled={densityPreset !== "custom"}
                />
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <Label htmlFor="units">Measurement Units</Label>
                <Select defaultValue="metric">
                  <SelectTrigger id="units">
                    <SelectValue placeholder="Select units" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="metric">Metric (m³, tonnes)</SelectItem>
                    <SelectItem value="imperial">Imperial (ft³, tons)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="storage" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Storage & Backup
              </CardTitle>
              <CardDescription>
                Configure data storage and backup settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-backup">Automatic Backup</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically backup project data
                  </p>
                </div>
                <Switch
                  id="auto-backup"
                  checked={autoBackup}
                  onCheckedChange={setAutoBackup}
                />
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <Label htmlFor="storage-location">Storage Location</Label>
                <div className="flex space-x-2">
                  <Input
                    id="storage-location"
                    value="./data/storage"
                    readOnly
                    className="flex-1"
                  />
                  <Button variant="outline">Browse</Button>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="retention">Data Retention Period</Label>
                <Select defaultValue="30">
                  <SelectTrigger id="retention">
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="365">1 year</SelectItem>
                    <SelectItem value="0">Indefinite</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="api" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="h-5 w-5" />
                API Configuration
              </CardTitle>
              <CardDescription>
                Configure API endpoints and authentication
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="api-endpoint">API Endpoint</Label>
                <Input
                  id="api-endpoint"
                  value={apiEndpoint}
                  onChange={(e) => setApiEndpoint(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="api-key">API Key</Label>
                <Input
                  id="api-key"
                  type="password"
                  value="••••••••••••••••••••••"
                  readOnly
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="api-auth">API Authentication</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable API key authentication
                  </p>
                </div>
                <Switch
                  id="api-auth"
                  defaultChecked
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      <div className="flex justify-end space-x-2">
        <Button variant="outline" onClick={resetSettings}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset
        </Button>
        <Button onClick={handleSaveSettings} disabled={isLoading}>
          {isLoading ? (
            <>Saving...</>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </div>
  );
}